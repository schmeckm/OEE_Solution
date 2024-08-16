const mqtt = require('mqtt');
const { get: getSparkplugPayload } = require('sparkplug-payload');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { mqtt: mqttConfig, structure, topicFormat } = require('../config/config');
const { handleCommandMessage, handleOeeMessage } = require('./messageHandler');
const { loadProcessOrderData, loadMachineData } = require('../src/dataLoader'); // Sicherstellen, dass der Pfad korrekt ist
const oeeConfig = require('../config/oeeConfig.json');

/**
 * Sets up the MQTT client, handles connection events, and subscribes to topics.
 * @returns {Object} The MQTT client instance.
 */
/**
 * Sets up the MQTT client.
 * 
 * @returns {Object} The MQTT client object.
 */
function setupMqttClient() {
    oeeLogger.info('Setting up MQTT client...');

    const client = mqtt.connect(mqttConfig.brokers.area.url, {
        username: mqttConfig.auth.username,
        password: mqttConfig.auth.password,
        key: mqttConfig.tls.key,
        cert: mqttConfig.tls.cert,
        ca: mqttConfig.tls.ca
    });

    client.on('connect', () => {
        oeeLogger.info('MQTT client connected');
        subscribeToTopics(client);
    });

    client.on('message', async(topic, message) => {
        try {
            // Extrahiere die relevanten Teile des Topics
            const topicParts = topic.split('/');
            const [version, location, dataType, line, metric] = topicParts;

            oeeLogger.debug(`Received message on topic ${topic}: line=${line}, metric=${metric}`);

            // Erhalte die machine_id aus machine.json basierend auf dem Liniencode
            const machineId = await getMachineIdFromLineCode(line);

            if (!machineId) {
                oeeLogger.warn(`No machine found for line: ${line}`);
                return;
            }

            // Überprüfe, ob ein Auftrag im Status "REL" existiert
            const hasRunningOrder = await checkForRunningOrder(machineId);

            if (!hasRunningOrder) {
                oeeLogger.info(`No running order found for line ${line} (machine_id=${machineId}). Skipping OEE calculation.`);
                return; // Keine OEE-Berechnung, da kein laufender Auftrag vorhanden ist
            }

            // Decodiere die Sparkplug-Nachricht
            const sparkplug = getSparkplugPayload('spBv1.0');
            const decodedMessage = sparkplug.decodePayload(message);

            // Verarbeite die Nachricht basierend auf dem dataType (DCMD oder DDATA)
            if (dataType === 'DCMD') {
                handleCommandMessage(decodedMessage, machineId, metric);
            } else if (dataType === 'DDATA') {
                handleOeeMessage(decodedMessage, machineId, metric);
            } else {
                oeeLogger.warn(`Unknown data type in topic: ${dataType}`);
            }
        } catch (error) {
            errorLogger.error(`Error processing message on topic ${topic}: ${error.message}`);
            errorLogger.error(`Received message: ${message.toString()}`);
        }
    });

    client.on('error', (error) => {
        errorLogger.error(`MQTT client error: ${error.message}`);
    });

    client.on('reconnect', () => {
        oeeLogger.warn('MQTT client reconnecting...');
    });

    client.on('close', () => {
        oeeLogger.warn('MQTT client connection closed');
    });

    return client;
}

/**
 * Subscribes the MQTT client to necessary topics based on the OEE configuration.
 * @param {Object} client - The MQTT client instance.
 */
function subscribeToTopics(client) {
    Object.keys(oeeConfig).forEach(metric => {
        const topic = `${topicFormat.replace('group_id', structure.Group_id).replace('message_type', 'DDATA').replace('edge_node_id', structure.edge_node_id)}/${metric}`;
        console.log(`Subscribing to topic: ${topic}`);
        client.subscribe(topic, (err) => {
            if (!err) {
                oeeLogger.info(`Successfully subscribed to topic: ${topic}`);
            } else {
                errorLogger.error(`Error subscribing to topic ${topic}: ${err.message}`);
            }
        });
    });

    const commandTopic = `${topicFormat.replace('group_id', structure.Group_id).replace('message_type', 'DCMD').replace('edge_node_id', structure.edge_node_id)}/#`;
    console.log(`Subscribing to command topic: ${commandTopic}`);
    client.subscribe(commandTopic, (err) => {
        if (!err) {
            oeeLogger.info(`Successfully subscribed to command topic: ${commandTopic}`);
        } else {
            errorLogger.error(`Error subscribing to command topic ${commandTopic}: ${err.message}`);
        }
    });
}

/**
 * Get machine ID from the line code by looking up in machine.json
 * @param {string} lineCode - The line code from the MQTT topic.
 * @returns {string|null} The machine ID or null if not found.
 */
async function getMachineIdFromLineCode(lineCode) {
    oeeLogger.debug(`Searching for machine ID with line code: ${lineCode}`);
    const machines = loadMachineData(); // Funktion zum Laden von machine.json
    const machine = machines.find(m => m.name === lineCode);

    if (machine) {
        oeeLogger.info(`Machine ID ${machine.machine_id} found for line code: ${lineCode}`);
    } else {
        oeeLogger.warn(`No machine ID found for line code: ${lineCode}`);
    }

    return machine ? machine.machine_id : null;
}

/**
 * Check if there is a running order (ProcessOrderStatus = "REL") for the given machine ID.
 * @param {string} machineId - The machine ID.
 * @returns {boolean} True if there is a running order, false otherwise.
 */
async function checkForRunningOrder(machineId) {

    const processOrders = loadProcessOrderData(); // Funktion zum Laden von processOrder.json

    const runningOrder = processOrders.find(order => order.machine_id === machineId && order.ProcessOrderStatus === "REL");

    if (runningOrder) {
        oeeLogger.info(`Running order found: ProcessOrderNumber=${runningOrder.ProcessOrderNumber} for machine ID: ${machineId}`);
    } else {
        oeeLogger.info(`No running order found for machine ID: ${machineId}`);
    }

    return !!runningOrder; // Return true if a running order is found, otherwise false
}

module.exports = { setupMqttClient };