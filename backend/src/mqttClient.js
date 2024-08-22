const mqtt = require('mqtt');
const { get: getSparkplugPayload } = require('sparkplug-payload');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { mqtt: mqttConfig } = require('../config/config');
const { handleCommandMessage, handleOeeMessage } = require('./messageHandler');
const oeeConfig = require('../config/oeeConfig.json');
const { loadProcessOrderData, loadMachineData } = require('./dataLoader'); // Import from dataLoader

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
        tryToSubscribeToMachineTopics(client);
    });

    client.on('message', async(topic, message) => {
        try {
            const topicParts = topic.split('/');
            const [version, location, area, dataType, machineName, metric] = topicParts;

            oeeLogger.debug(`Received message on topic ${topic}: machine=${machineName}, metric=${metric}`);

            const machineId = await getMachineIdFromLineCode(machineName);
            if (!machineId) {
                oeeLogger.warn(`No machine ID found for machine name: ${machineName}`);
                return;
            }

            const hasRunningOrder = await checkForRunningOrder(machineId);
            if (!hasRunningOrder) {
                oeeLogger.info(`No running order found for machine ${machineName} (machine_id=${machineId}). Skipping OEE calculation.`);
                return;
            }

            const sparkplug = getSparkplugPayload('spBv1.0');
            const decodedMessage = sparkplug.decodePayload(message);

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

function tryToSubscribeToMachineTopics(client) {
    const allMachines = loadMachineData();
    const oeeEnabledMachines = allMachines.filter(machine => machine.OEE === true);

    function tryNextMachine(index) {
        if (index >= oeeEnabledMachines.length) {
            oeeLogger.info('No more machines to try for MQTT topics.');
            return;
        }

        const machine = oeeEnabledMachines[index];
        const topics = generateMqttTopics(machine);

        let subscribed = false;
        let pendingSubscriptions = topics.length;

        topics.forEach((topic) => {
            client.subscribe(topic, (err) => {
                pendingSubscriptions--;
                if (!err) {
                    subscribed = true;
                    oeeLogger.info(`Successfully subscribed to topic for machine ${machine.name}: ${topic}`);
                } else {
                    errorLogger.error(`Error subscribing to topic ${topic} for machine ${machine.name}: ${err.message}`);
                }

                if (pendingSubscriptions === 0) {
                    if (!subscribed) {
                        oeeLogger.warn(`No MQTT topics available for machine ${machine.name}. Trying next machine...`);
                    }
                    tryNextMachine(index + 1);
                }
            });
        });
    }

    tryNextMachine(0);
}

function generateMqttTopics(machine) {
    const topics = [];
    const oeeMetrics = Object.keys(oeeConfig);

    oeeMetrics.forEach(metric => {
        const topic = `spBv1.0/${machine.Plant}/${machine.area}/DDATA/${machine.name}/${metric}`;
        topics.push(topic);
    });

    return topics;
}

async function getMachineIdFromLineCode(lineCode) {
    oeeLogger.debug(`Searching for machine ID with line code: ${lineCode}`);
    const machines = loadMachineData();
    const machine = machines.find(m => m.name === lineCode);

    if (machine) {
        oeeLogger.info(`Machine ID ${machine.machine_id} found for line code: ${lineCode}`);
    } else {
        oeeLogger.warn(`No machine ID found for line code: ${lineCode}`);
    }

    return machine ? machine.machine_id : null;
}

async function checkForRunningOrder(machineId) {
    const processOrders = loadProcessOrderData();

    const runningOrder = processOrders.find(order => order.machine_id === machineId && order.ProcessOrderStatus === "REL");

    if (runningOrder) {
        oeeLogger.debug(`Running order found: ProcessOrderNumber=${runningOrder.ProcessOrderNumber} for machine ID: ${machineId}`);
    } else {
        oeeLogger.error(`No running order found for machine ID: ${machineId}`);
    }

    return !!runningOrder;
}

module.exports = { setupMqttClient };