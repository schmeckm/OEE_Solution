const { oeeLogger, errorLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../utils/oeeCalculator');
const { getunplannedDowntime, getPlannedDowntime } = require('../utils/downtimeManager');
const { influxdb, oeeAsPercent, structure } = require('../config/config');
const WebSocket = require('ws'); // Import WebSocket

const oeeCalculator = new OEECalculator();
let receivedMetrics = {}; // Object to store received metrics
let wss = null; // WebSocket server instance

/**
 * Function to set the WebSocket server instance
 * @param {WebSocket.Server} server - The WebSocket server instance
 */
function setWebSocketServer(server) {
    wss = server;
}

/**
 * Updates a metric in the receivedMetrics object and in the OEECalculator instance
 * @param {string} name - The name of the metric to update
 * @param {number} value - The new value of the metric
 */
function updateMetric(name, value) {
    receivedMetrics[name] = value;
    oeeCalculator.updateData(name, value);
    oeeLogger.debug(`Metric updated: ${name} = ${value}`);
}

/**
 * Processes metrics including loading process order, calculating downtime,
 * calculating OEE metrics, logging results, and optionally writing to InfluxDB.
 */
async function processMetrics() {
    try {
        await oeeCalculator.init(); // Initialize the OEECalculator with process order data
        await oeeCalculator.calculateMetrics(); // Calculate OEE metrics
        const { oee, availability, performance, quality } = oeeCalculator.getMetrics(); // Get calculated metrics
        const level = oeeCalculator.classifyOEE(oee / 100); // Classify OEE level based on score

        // Log calculated metrics and OEE level
        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        // Round values to two decimal places and convert to percentage
        const roundedMetrics = {
            oee: Math.round(oee * 100) / 100,
            availability: Math.round(availability * 10000) / 100,
            performance: Math.round(performance * 10000) / 100,
            quality: Math.round(quality * 10000) / 100,
            level: level // Include the OEE level in the payload
        };

        // Send metrics to all connected WebSocket clients
        if (wss) {
            const payload = JSON.stringify(roundedMetrics);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
        }

        // Write metrics to InfluxDB if configuration is provided
        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(oee, availability, performance, quality, { group_id: structure.Group_id, edge_node_id: structure.edge_node_id });
        }
    } catch (error) {
        errorLogger.error(`Error calculating metrics: ${error.message}`);
    }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };