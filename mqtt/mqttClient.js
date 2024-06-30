const mqtt = require('mqtt');
const { get: getSparkplugPayload } = require('sparkplug-payload');
const logger = require('../utils/logger');
const { mqtt: mqttConfig, oeeAsPercent, influxdb, structure, topicFormat } = require('../config/config');
const { calculateOEE, writeOEEToInfluxDB } = require('./oeeCalculator');
const oeeConfig = require('../config/oeeConfig.json'); // Load oeeConfig

// Initialize OEE data structure with default values
let oeeData = {
    plannedProduction: 0,
    runtime: 0,
    actualPerformance: 0,
    targetPerformance: 0,
    goodProducts: 0,
    totalProduction: 0,
    availability: 0,
    performance: 0,
    quality: 0,
    oee: 0
};

/**
 * Setup MQTT client to subscribe to topics and handle messages
 */
function setupMqttClient() {
    // Connect to MQTT broker with the specified configuration
    const client = mqtt.connect(mqttConfig.brokers.area.url, {
        username: mqttConfig.auth.username,
        password: mqttConfig.auth.password,
        key: mqttConfig.tls.key,
        cert: mqttConfig.tls.cert,
        ca: mqttConfig.tls.ca
    });

    // On successful connection, subscribe to the configured topics
    client.on('connect', () => {
        Object.keys(oeeConfig).forEach(metric => {
            const topic = `${topicFormat
                .replace('group_id', structure.Group_id)
                .replace('message_type', 'DDATA')
                .replace('edge_node_id', structure.edge_node_id)}/${metric}`;
            client.subscribe(topic, err => {
                if (!err) {
                    logger.info(`Successfully subscribed to topic: ${topic}`);
                } else {
                    logger.error(`Error subscribing to topic ${topic}: ${err}`);
                }
            });
        });
    });

    // On receiving a message, decode the payload and update OEE data
    client.on('message', (topic, message) => {
        try {
            const sparkplug = getSparkplugPayload('spBv1.0');
            const decodedMessage = sparkplug.decodePayload(message);
            const metric = topic.split('/').pop(); // Extract the metric name from the topic
            const value = decodedMessage.metrics[0].value; // Assume the message has a known structure

            // Extract Plant, Area, and Line from the topic
            const [, group_id, message_type, edge_node_id] = topic.split('/');

            // Update the OEE data
            oeeData[metric] = value;

            // Log the topic and value
            logger.info(`Decoded message from topic ${topic}: ${JSON.stringify(decodedMessage)}`);
            logger.info(`Updated oeeData: ${JSON.stringify(oeeData)}`);

            // Calculate OEE and log the results
            const { oee, availability, performance, quality } = calculateOEE(oeeData);
            logger.info(`Calculated OEE: ${oee}%`);
            logger.info(`Availability: ${availability}, Performance: ${performance}, Quality: ${quality}`);

            // Publish OEE data to MQTT
            const oeePayload = {
                timestamp: Date.now(),
                metrics: [
                    { name: 'oee', value: oeeAsPercent ? oee : oee / 100, type: 'Float' },
                    { name: 'availability', value: oeeAsPercent ? availability * 100 : availability, type: 'Float' },
                    { name: 'performance', value: oeeAsPercent ? performance * 100 : performance, type: 'Float' },
                    { name: 'quality', value: oeeAsPercent ? quality * 100 : quality, type: 'Float' }
                ]
            };
            client.publish(`spBv1.0/${group_id}/DDATA/${edge_node_id}/OEE`, sparkplug.encodePayload(oeePayload));
            logger.info(`Published OEE payload: ${JSON.stringify(oeePayload)}`);

            // Write to InfluxDB if configuration is available
            if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
                const metadata = structure.device_id[edge_node_id].metadata || {};
                writeOEEToInfluxDB(oee, availability, performance, quality, { group_id, edge_node_id, ...metadata });
            }
        } catch (error) {
            logger.error(`Error parsing message on topic ${topic}: ${error}`);
        }
    });

    return client;
}

module.exports = { setupMqttClient };