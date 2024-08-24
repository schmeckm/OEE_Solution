const mqtt = require("mqtt");
const { get: getSparkplugPayload } = require("sparkplug-payload");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { mqtt: mqttConfig } = require("../config/config");
const { handleCommandMessage, handleOeeMessage } = require("./messageHandler");
const oeeConfig = require("../config/oeeConfig.json");
const {
  checkForRunningOrder,
  loadMachineData,
  getMachineIdFromLineCode,
} = require("./dataLoader");

const metrics = {
  messagesReceived: 0,
  reconnections: 0,
  lastConnectionTime: null,
  totalConnectionDuration: 0,
};

let lastMessageTimestamp = Date.now();
const watchdogInterval = 60000; // 60 seconds

/**
 * Sets up the MQTT client, handles connection events, and processes incoming messages.
 *
 * @returns {Object} The initialized MQTT client.
 */
function setupMqttClient() {
  oeeLogger.info("Setting up MQTT client...");

  const client = mqtt.connect(mqttConfig.brokers.area.url, {
    username: mqttConfig.auth.username,
    password: mqttConfig.auth.password,
    key: mqttConfig.tls.key,
    cert: mqttConfig.tls.cert,
    ca: mqttConfig.tls.ca,
  });

  // Event handler for when the client successfully connects to the MQTT broker
  client.on("connect", () => {
    oeeLogger.info("MQTT client connected");
    metrics.lastConnectionTime = Date.now();
    tryToSubscribeToMachineTopics(client);
  });

  // Event handler for processing incoming MQTT messages
  client.on("message", async (topic, message) => {
    metrics.messagesReceived++;
    lastMessageTimestamp = Date.now();
    try {
      const topicParts = topic.split("/");
      const [version, location, area, dataType, machineName, metric] =
        topicParts;

      oeeLogger.debug(
        `Received message on topic ${topic}: machine=${machineName}, metric=${metric}`
      );

      const machineId = await getMachineIdFromLineCode(machineName);
      if (!machineId) {
        oeeLogger.warn(`No machine ID found for machine name: ${machineName}`);
        return;
      }

      const hasRunningOrder = await checkForRunningOrder(machineId);
      if (!hasRunningOrder) {
        oeeLogger.warn(
          `No running order found for machine ${machineName} (machine_id=${machineId}). Skipping OEE calculation.`
        );
        return;
      }

      const sparkplug = getSparkplugPayload("spBv1.0");
      const decodedMessage = sparkplug.decodePayload(message);

      if (dataType === "DCMD") {
        handleCommandMessage(decodedMessage, machineId, metric);
      } else if (dataType === "DDATA") {
        handleOeeMessage(decodedMessage, machineId, metric);
      } else {
        oeeLogger.warn(`Unknown data type in topic: ${dataType}`);
      }
    } catch (error) {
      errorLogger.error(
        `Error processing message on topic ${topic}: ${error.message}`
      );
      errorLogger.error(`Received message: ${message.toString()}`);
    }
  });

  // Event handler for logging MQTT client errors
  client.on("error", (error) => {
    errorLogger.error(`MQTT client error: ${error.message}`);
  });

  // Event handler for when the client attempts to reconnect
  client.on("reconnect", () => {
    metrics.reconnections++;
    oeeLogger.warn("MQTT client reconnecting...");
    clearPendingMessages(); // Example function to handle any necessary cleanup
    resetStateMachine(); // Example function to reset internal states
  });

  // Event handler for when the client connection is closed
  client.on("close", () => {
    if (metrics.lastConnectionTime) {
      metrics.totalConnectionDuration +=
        Date.now() - metrics.lastConnectionTime;
    }
    oeeLogger.warn("MQTT client connection closed");
  });

  // Watchdog to monitor client activity and force reconnection if needed
  setInterval(() => {
    if (Date.now() - lastMessageTimestamp > watchdogInterval) {
      oeeLogger.warn(
        "No messages received for over 60 seconds. Resetting MQTT connection."
      );
      client.end(true, () => setupMqttClient()); // Force reconnection
    }
  }, watchdogInterval);

  return client;
}

/**
 * Attempts to subscribe the MQTT client to relevant topics for OEE-enabled machines.
 *
 * @param {Object} client - The MQTT client instance.
 */
function tryToSubscribeToMachineTopics(client) {
  const allMachines = loadMachineData();
  const oeeEnabledMachines = allMachines.filter(
    (machine) => machine.OEE === true
  );

  function tryNextMachine(index) {
    if (index >= oeeEnabledMachines.length) {
      oeeLogger.info("No more machines to try for MQTT topics.");
      return;
    }

    const machine = oeeEnabledMachines[index];
    const topics = generateMqttTopics(machine);

    let subscribed = false;
    let pendingSubscriptions = topics.length;

    topics.forEach((topic) => {
      subscribeWithRetry(client, topic).then((success) => {
        pendingSubscriptions--;
        if (success) {
          subscribed = true;
        }

        if (pendingSubscriptions === 0) {
          if (!subscribed) {
            oeeLogger.warn(
              `No MQTT topics available for machine ${machine.name}. Trying next machine...`
            );
          }
          tryNextMachine(index + 1);
        }
      });
    });
  }

  tryNextMachine(0);
}

/**
 * Generates a list of MQTT topics for a given machine based on OEE metrics.
 *
 * @param {Object} machine - The machine object containing details like Plant, area, and name.
 * @returns {Array} Array of MQTT topic strings.
 */
function generateMqttTopics(machine) {
  const topics = [];
  const oeeMetrics = Object.keys(oeeConfig);

  oeeMetrics.forEach((metric) => {
    const topic = `spBv1.0/${machine.Plant}/${machine.area}/DDATA/${machine.name}/${metric}`;
    topics.push(topic);
  });

  return topics;
}

/**
 * Subscribes to an MQTT topic with retry logic.
 *
 * @param {Object} client - The MQTT client instance.
 * @param {String} topic - The MQTT topic to subscribe to.
 * @param {Number} retries - Number of retries before giving up.
 * @param {Number} delay - Initial delay between retries, will increase exponentially.
 * @returns {Promise<Boolean>} Resolves to true if subscription succeeds, otherwise false.
 */
async function subscribeWithRetry(client, topic, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await client.subscribe(topic);
      oeeLogger.info(`Successfully subscribed to topic: ${topic}`);
      return true;
    } catch (err) {
      oeeLogger.warn(
        `Failed to subscribe to topic: ${topic}. Retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  errorLogger.error(
    `Failed to subscribe to topic: ${topic} after ${retries} attempts.`
  );
  return false;
}

/**
 * Clears pending messages in the client's message queue.
 * This is a placeholder function and should be implemented according to specific needs.
 */
function clearPendingMessages() {
  // Implementation for clearing pending messages
}

/**
 * Resets the state machine or any internal states.
 * This is a placeholder function and should be implemented according to specific needs.
 */
function resetStateMachine() {
  // Implementation for resetting internal state
}

module.exports = { setupMqttClient };
