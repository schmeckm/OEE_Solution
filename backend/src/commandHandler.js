const { v4: uuidv4 } = require("uuid");
const moment = require("moment-timezone");
const axios = require("axios");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { oeeApiUrl } = require("../config/config");
const {
  loadAndConvertMachineStoppagesData,
  saveMachineStoppagesData,
} = require("./dataLoader");
const {
  sendWebSocketMessage,
  setWebSocketServer,
} = require("../websocket/webSocketUtils");

let currentHoldStatus = {};

/**
 * Initializes machine stoppages data and sends it via WebSocket.
 * @async
 * @function initializeMachineStoppages
 * @returns {Promise<void>}
 */
async function initializeMachineStoppages() {
  try {
    const initialMicrostops = loadAndConvertMachineStoppagesData();
    sendWebSocketMessage("Microstops", initialMicrostops);
  } catch (error) {
    logError("Failed to load initial machine stoppages data", error);
  }
}
initializeMachineStoppages();

/**
 * Fetches the current process order for a specific machine.
 *
 * This function sends an HTTP GET request to fetch the process order associated with the given machine ID.
 * It assumes that the API returns an array of process orders and returns the first entry in the array.
 *
 * @async
 * @function fetchProcessOrder
 * @param {string} machineId - The ID of the machine to fetch the process order for.
 * @returns {Promise<Object|null>} The first process order object if found, or null if an error occurs or no process order is found.
 */
async function fetchProcessOrder(machineId) {
  try {
    const response = await axios.get(`${oeeApiUrl}/api/v1/processorders/rel`, {
      params: { machineId, mark: true },
    });
    return response.data[0]; // Assuming the first entry is the relevant one
  } catch (error) {
    logError(`Failed to fetch process order for machineId ${machineId}`, error);
    return null;
  }
}

/**
 * Logs an error message.
 * @function logError
 * @param {string} message - The error message to log.
 * @param {Error} error - The error object containing details about the error.
 */
function logError(message, error) {
  errorLogger.error(`${message}: ${error.message}`);
}

/**
 * Logs an informational message.
 * @function logInfo
 * @param {string} message - The informational message to log.
 */
function logInfo(message) {
  oeeLogger.info(message);
}

/**
 * Logs an event to the database with a timestamp.
 * @function logEventToDatabase
 * @param {string} event - The event type to log.
 * @param {string} timestamp - The ISO timestamp of the event.
 */
function logEventToDatabase(event, timestamp) {
  if (!event || !timestamp) {
    logError("Event or timestamp missing or invalid", new Error());
    return;
  }
  logInfo(`Logging event to database: ${event} at ${timestamp}`);
}

/**
 * Notifies personnel about a specific event.
 * @function notifyPersonnel
 * @param {string} message - The message to send to personnel.
 */
function notifyPersonnel(message) {
  logInfo(`Notifying personnel: ${message}`);
}

/**
 * Handles the "Hold" command, which places the machine on hold.
 * @function handleHoldCommand
 * @param {number} value - The value indicating whether to hold the machine (1 for hold).
 */
function handleHoldCommand(value) {
  const timestamp = moment().tz(TIMEZONE).toISOString();
  logInfo(`handleHoldCommand called with value: ${value}`);

  if (value !== 1) {
    logInfo("Hold command received, but value is not 1");
    return;
  }

  logInfo("Machine is on Hold");
  stopMachineOperations();
  logEventToDatabase("Hold", timestamp);
  notifyPersonnel("Machine has been put on hold.");

  // Extract the process order number from the processOrderData
  const processOrderDataEntry = processOrderData && processOrderData[0];

  if (!processOrderDataEntry) {
    logInfo("No valid process order data found. Hold signal ignored.");
    return;
  }

  const processOrderNumber = processOrderDataEntry.ProcessOrderNumber;

  // Initialize or update the hold status for the process order
  currentHoldStatus[processOrderNumber] =
    currentHoldStatus[processOrderNumber] || [];
  currentHoldStatus[processOrderNumber].push({ timestamp });

  console.log(`Hold signal recorded in Microstops.json at ${timestamp}`);
}

/**
 * Handles the "Unhold" command, which resumes machine operations.
 * @function handleUnholdCommand
 * @param {number} value - The value indicating whether to unhold the machine (1 for unhold).
 */
function handleUnholdCommand(value) {
  const timestamp = moment().tz(TIMEZONE).toISOString();
  logInfo(`handleUnholdCommand called with value: ${value}`);

  if (value !== 1) {
    logInfo("Unhold command received, but value is not 1");
    return;
  }

  // Extract the process order number and order ID from the processOrderData
  const processOrderDataEntry = processOrderData && processOrderData[0];

  if (!processOrderDataEntry) {
    logInfo("Unhold command received, but no valid process order data found.");
    return;
  }

  const processOrderNumber = processOrderDataEntry.ProcessOrderNumber;
  const order_id = processOrderDataEntry.order_id;

  // Check if the hold status exists for the process order
  if (
    !currentHoldStatus[processOrderNumber] ||
    !currentHoldStatus[processOrderNumber].length
  ) {
    logInfo(
      "Unhold command received, but no previous Hold signal found or process order is invalid."
    );
    console.log("Current Hold Status:", currentHoldStatus);
    return;
  }

  handleUnholdMachine(processOrderNumber, order_id, timestamp);
}

/**
 * Handles the process of unholding the machine, resuming operations, and logging the event.
 * @function handleUnholdMachine
 * @param {string} processOrderNumber - The process order number associated with the unhold event.
 * @param {string} order_id - The ID of the process order.
 * @param {string} timestamp - The timestamp when the unhold event occurred.
 */
function handleUnholdMachine(processOrderNumber, order_id, timestamp) {
  logInfo("Machine is now Unhold");
  startMachineOperations();
  logEventToDatabase("Unhold", timestamp);
  notifyPersonnel("Machine has been unhold and resumed operations.");

  const holdTimestamp = moment(
    currentHoldStatus[processOrderNumber].pop().timestamp
  );
  const downtimeSeconds = moment(timestamp).diff(holdTimestamp, "seconds");

  if (currentHoldStatus[processOrderNumber].length === 0) {
    delete currentHoldStatus[processOrderNumber];
  }

  if (downtimeSeconds < THRESHOLD_SECONDS) {
    logInfo(
      `Downtime of ${downtimeSeconds} seconds did not meet the threshold of ${THRESHOLD_SECONDS} seconds. No entry recorded.`
    );
    return;
  }

  const machineStoppageEntry = {
    ID: uuidv4(),
    ProcessOrderID: order_id,
    ProcessOrderNumber: processOrderNumber,
    Start: holdTimestamp.toISOString(),
    End: moment(timestamp).toISOString(),
    Reason: "tbd",
    Differenz: downtimeSeconds,
  };

  try {
    const Microstops = saveMachineStoppagesData(machineStoppageEntry);
    sendWebSocketMessage("Microstops", Microstops);
  } catch (error) {
    logError("Error saving Microstops data", error);
  }
}

/**
 * Placeholder function to handle the start of a process order.
 * @function handleProcessOrderStartCommand
 * @param {number} value - The value associated with the start command.
 * @param {string} machineId - The ID of the machine starting the process order.
 */
function handleProcessOrderStartCommand(value, machineId) {
  logInfo(
    `handleProcessOrderStartCommand called with value: ${value}, machineId: ${machineId}`
  );
}

/**
 * Placeholder function to handle the end of a process order.
 * @function handleProcessOrderEndCommand
 * @param {number} value - The value associated with the end command.
 * @param {string} machineId - The ID of the machine ending the process order.
 */
function handleProcessOrderEndCommand(value, machineId) {
  logInfo(
    `handleProcessOrderEndCommand called with value: ${value}, machineId: ${machineId}`
  );
}

/**
 * Stops machine operations.
 * @function stopMachineOperations
 */
function stopMachineOperations() {
  logInfo("Stopping machine operations...");
}

/**
 * Starts machine operations.
 * @function startMachineOperations
 */
function startMachineOperations() {
  logInfo("Starting machine operations...");
}

// Exporting the functions for use in other modules
module.exports = {
  handleHoldCommand,
  handleUnholdCommand,
  handleProcessOrderStartCommand, // Placeholder export
  handleProcessOrderEndCommand, // Placeholder export
  setWebSocketServer,
};
