const mqtt = require('mqtt');
const { get: getSparkplugPayload } = require('sparkplug-payload');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { mqtt: mqttConfig, structure, topicFormat } = require('../config/config');
const { handleCommandMessage, handleOeeMessage } = require('./messageHandler');
const oeeConfig = require('../config/oeeConfig.json');

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

    client.on('message', (topic, message) => {
        try {
            const sparkplug = getSparkplugPayload('spBv1.0');
            const decodedMessage = sparkplug.decodePayload(message);
            oeeLogger.debug(`Received message on topic ${topic}: ${JSON.stringify(decodedMessage)}`);
            if (topic.includes('DCMD')) {
                handleCommandMessage(decodedMessage);
            } else {
                handleOeeMessage(decodedMessage);
            }
        } catch (error) {
            errorLogger.error(`Error processing message on topic ${topic}: ${error.message}`);
            errorLogger.error(`Received message: ${message.toString()}`);
        }
    });

    client.on('error', error => {
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

function subscribeToTopics(client) {
    Object.keys(oeeConfig).forEach(metric => {
        const topic = `${topicFormat.replace('group_id', structure.Group_id).replace('message_type', 'DDATA').replace('edge_node_id', structure.edge_node_id)}/${metric}`;
        console.log(`Subscribing to topic: ${topic}`);
        client.subscribe(topic, err => {
            if (!err) {
                oeeLogger.info(`Successfully subscribed to topic: ${topic}`);
            } else {
                errorLogger.error(`Error subscribing to topic ${topic}: ${err.message}`);
            }
        });
    });

    const commandTopic = `${topicFormat.replace('group_id', structure.Group_id).replace('message_type', 'DCMD').replace('edge_node_id', structure.edge_node_id)}/#`;
    console.log(`Subscribing to command topic: ${commandTopic}`);
    client.subscribe(commandTopic, err => {
        if (!err) {
            oeeLogger.info(`Successfully subscribed to command topic: ${commandTopic}`);
        } else {
            errorLogger.error(`Error subscribing to command topic ${commandTopic}: ${err.message}`);
        }
    });
}

module.exports = { setupMqttClient };