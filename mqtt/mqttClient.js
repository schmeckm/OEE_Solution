const mqtt = require('mqtt');
const logger = require('../utils/logger');
const { mqtt: mqttConfig } = require('../config/config');
const { calculateOEE } = require('./oeeCalculator');
const { get: getSparkplugPayload } = require('sparkplug-payload');

let oeeData = {
    plannedProduction: 0,
    runtime: 0,
    actualPerformance: 0,
    targetPerformance: 0,
    goodProducts: 0,
    totalProduction: 0,
    metadata: {},
    availability: 0,
    performance: 0,
    quality: 0,
    oee: 0
};

const setupMqttClient = () => {
    const client = mqtt.connect(mqttConfig.brokers.area.url, {
        username: mqttConfig.auth.username,
        password: mqttConfig.auth.password,
        keyPath: mqttConfig.tls.key,
        certPath: mqttConfig.tls.cert,
        caPaths: mqttConfig.tls.ca
    });

    client.on('connect', () => {
        Object.keys(oeeData).forEach(metric => {
            const topic = `spBv1.0/Basel/DDATA/Falcon11/${metric}`;
            client.subscribe(topic, err => {
                if (!err) {
                    logger.info(`Successfully subscribed to topic: ${topic}`);
                } else {
                    logger.error(`Error subscribing to topic ${topic}: ${err}`);
                }
            });
        });
    });

    client.on('message', (topic, message) => {
        try {
            const sparkplug = getSparkplugPayload('spBv1.0');
            const decodedMessage = sparkplug.decodePayload(message);
            const metric = topic.split('/').pop();
            const value = decodedMessage.metrics[0].value;

            oeeData[metric] = value;

            logger.info(`Decoded message from topic ${topic}: ${JSON.stringify(decodedMessage)}`);
            logger.info(`Updated oeeData: ${JSON.stringify(oeeData)}`);

            calculateOEE(oeeData, client);
        } catch (error) {
            logger.error(`Error parsing message on topic ${topic}: ${error}`);
        }
    });

    return client;
};

module.exports = {
    setupMqttClient
};