const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { loadProcessOrderData, loadMachineStoppagesData } = require('../src/dataLoader');
const config = require('../config/config'); // Import the config
const { setWebSocketServer, sendWebSocketMessage } = require('./webSocketUtils'); // Import WebSocket utilities

dotenv.config(); // Load environment variables from .env file

let currentHoldStatus = {};
let processOrderData = null;

// Use the threshold value from the config
const THRESHOLD_SECONDS = config.thresholdSeconds;

// Path to the MachineData.json file
const dbFilePath = path.join(__dirname, '../data/machineStoppages.json');

// Try to load process order data on module start
try {
    processOrderData = loadProcessOrderData();
    oeeLogger.info(`Process order data loaded: ${JSON.stringify(processOrderData)}`);
    if (processOrderData && processOrderData.length > 0) {
        oeeLogger.info(`Loaded ProcessOrderNumber: ${processOrderData[0].ProcessOrderNumber}`);
    } else {
        oeeLogger.warn('Process order data is empty or undefined.');
    }
} catch (error) {
    errorLogger.error(`Failed to load process order data: ${error.message}`);
}

// Send initial machine stoppages data to WebSocket clients
try {
    const initialMachineData = loadMachineStoppagesData();
    sendWebSocketMessage('machineData', initialMachineData);
} catch (error) {
    errorLogger.error(`Failed to load initial machine stoppages data: ${error.message}`);
}

// Handle Hold command
function handleHoldCommand(value) {
    const timestamp = new Date().toISOString();

    oeeLogger.debug(`handleHoldCommand called with value: ${value}`);

    if (value === 1) {
        oeeLogger.info('Machine is on Hold');
        stopMachineOperations();
        logEventToDatabase('Hold', timestamp);
        notifyPersonnel('Machine has been put on hold.');

        const processOrderNumber = processOrderData && processOrderData[0] && processOrderData[0].ProcessOrderNumber;
        if (processOrderNumber) {
            if (!currentHoldStatus[processOrderNumber]) {
                currentHoldStatus[processOrderNumber] = [];
            }
            currentHoldStatus[processOrderNumber].push({ timestamp });

            console.log(`Hold signal recorded in MachineData.json at ${timestamp}`);
        } else {
            oeeLogger.warn('No valid process order data found. Hold signal ignored.');
        }
    } else {
        oeeLogger.info('Hold command received, but value is not 1');
    }
}

// Handle Unhold command
function handleUnholdCommand(value) {
    const timestamp = new Date().toISOString();

    oeeLogger.debug(`handleUnholdCommand called with value: ${value}`);

    if (value === 1) {
        const processOrderNumber = processOrderData && processOrderData[0] && processOrderData[0].ProcessOrderNumber;
        const order_id = processOrderData && processOrderData[0] && processOrderData[0].order_id;

        if (processOrderNumber && order_id) {
            if (currentHoldStatus[processOrderNumber] && currentHoldStatus[processOrderNumber].length > 0) {
                oeeLogger.info('Machine is now Unhold');
                startMachineOperations();
                logEventToDatabase('Unhold', timestamp);
                notifyPersonnel('Machine has been unhold and resumed operations.');

                const holdTimestamp = new Date(currentHoldStatus[processOrderNumber][currentHoldStatus[processOrderNumber].length - 1].timestamp);
                const unholdTimestamp = new Date(timestamp);

                oeeLogger.debug(`holdTimestamp: ${holdTimestamp}`);
                oeeLogger.debug(`unholdTimestamp: ${unholdTimestamp}`);

                const downtimeSeconds = Math.round((unholdTimestamp - holdTimestamp) / 1000);

                oeeLogger.debug(`Calculated downtimeSeconds: ${downtimeSeconds}`);

                if (downtimeSeconds >= THRESHOLD_SECONDS) {
                    const machineStoppageEntry = {
                        "ProcessOrderID": order_id,
                        "ProcessOrderNumber": processOrderNumber,
                        "Start": holdTimestamp.toISOString(),
                        "End": unholdTimestamp.toISOString(),
                        "Differenz": downtimeSeconds
                    };

                    try {
                        let machineData = [];
                        if (fs.existsSync(dbFilePath)) {
                            const machineDataContent = fs.readFileSync(dbFilePath, 'utf8');
                            try {
                                machineData = JSON.parse(machineDataContent);
                            } catch (jsonError) {
                                oeeLogger.warn('MachineData.json is empty or invalid. Initializing with an empty array.');
                                machineData = [];
                            }
                        }

                        machineData.push(machineStoppageEntry);

                        fs.writeFileSync(dbFilePath, JSON.stringify(machineData, null, 2), 'utf8');
                        console.log(`Unhold signal recorded in MachineData.json at ${timestamp}`);
                        console.log(`Downtime for Order ${processOrderNumber}: ${downtimeSeconds} seconds`);

                        // Senden der aktualisierten Maschinendaten an WebSocket-Clients
                        sendWebSocketMessage('machineData', machineData);

                    } catch (error) {
                        console.error('Error writing MachineData.json:', error.message);
                    }
                } else {
                    oeeLogger.info(`Downtime of ${downtimeSeconds} seconds did not meet the threshold of ${THRESHOLD_SECONDS} seconds. No entry recorded.`);
                }

                currentHoldStatus[processOrderNumber].pop();

                if (currentHoldStatus[processOrderNumber].length === 0) {
                    delete currentHoldStatus[processOrderNumber];
                }
            } else {
                oeeLogger.info('Unhold command received, but no previous Hold signal found.');
                console.log('Current Hold Status:', currentHoldStatus);
            }
        } else {
            oeeLogger.warn('No valid process order data found. Unhold signal ignored.');
        }
    } else {
        oeeLogger.info('Unhold command received, but value is not 1');
    }
}

// Function to stop machine operations
function stopMachineOperations() {
    oeeLogger.info('Stopping machine operations...');
}

// Function to start machine operations
function startMachineOperations() {
    oeeLogger.info('Starting machine operations...');
}

// Function to log events to the database
function logEventToDatabase(event, timestamp) {
    try {
        if (!event || !timestamp) {
            throw new Error('Event or timestamp missing or invalid.');
        }

        oeeLogger.info(`Logging event to database: ${event} at ${timestamp}`);
    } catch (error) {
        errorLogger.error(`Error logging event to database: ${error.message}`);
    }
}

// Function to notify personnel
function notifyPersonnel(message) {
    oeeLogger.info(`Notifying personnel: ${message}`);
}

// Export the functions to be used in other modules
module.exports = { handleHoldCommand, handleUnholdCommand, setWebSocketServer };