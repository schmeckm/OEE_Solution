const { oeeLogger, errorLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../utils/oeeCalculator');
const { getunplannedDowntime, getPlannedDowntime, loadDataAndPrepareChart } = require('../utils/downtimeManager');
const { influxdb, oeeAsPercent, structure } = require('../config/config');
const WebSocket = require('ws');

const oeeCalculator = new OEECalculator();
let receivedMetrics = {};
let wss = null;

/**
 * Set the WebSocket server instance.
 * @param {Object} server - The WebSocket server instance.
 */
function setWebSocketServer(server) {
    wss = server;
}

/**
 * Update a metric with a new value.
 * @param {string} name - The metric name.
 * @param {number} value - The metric value.
 */
function updateMetric(name, value) {
    receivedMetrics[name] = value;
    oeeCalculator.updateData(name, value);
    oeeLogger.debug(`Metric updated: ${name} = ${value}`);
}

/**
 * Process metrics, calculate OEE, and send data via WebSocket.
 */
async function processMetrics() {
    try {
        oeeLogger.info('Starting metrics processing.');
        await oeeCalculator.init();
        await oeeCalculator.calculateMetrics();

        const metrics = oeeCalculator.getMetrics();
        const { oee, availability, performance, quality, ProcessOrderNumber, StartTime, EndTime, plannedProduction, machine_id } = metrics;

        if (!metrics) {
            throw new Error('Metrics could not be calculated or are undefined.');
        }

        const level = oeeCalculator.classifyOEE(oee / 100);

        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        // Calculate downtime
        let plannedDowntime;
        let unplannedDowntime;
        try {
            plannedDowntime = await getPlannedDowntime(ProcessOrderNumber, StartTime, EndTime);
            unplannedDowntime = await getunplannedDowntime(ProcessOrderNumber);
        } catch (downtimeError) {
            errorLogger.error(`Error calculating downtime: ${downtimeError.message}`);
            plannedDowntime = 0;
            unplannedDowntime = 0;
        }

        // Prepare payload
        const roundedMetrics = {
            oee: Math.round(oee * 100) / 100,
            availability: Math.round(availability * 10000) / 100,
            performance: Math.round(performance * 10000) / 100,
            quality: Math.round(quality * 10000) / 100,
            level: level,
            processData: {
                ProcessOrderNumber,
                StartTime,
                EndTime,
                plannedProduction,
                plannedDowntime,
                unplannedDowntime,
                machine_id
            }
        };

        // Log summary
        oeeLogger.info(`OEE Metrics Summary: OEE=${roundedMetrics.oee}%, Availability=${roundedMetrics.availability}%, Performance=${roundedMetrics.performance}%, Quality=${roundedMetrics.quality}%, Level=${roundedMetrics.level}`);
        oeeLogger.info(`Process Data: ${JSON.stringify(roundedMetrics.processData)}`);

        // Send metrics to all connected WebSocket clients
        if (wss) {
            const payload = JSON.stringify(roundedMetrics);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
            oeeLogger.info('Metrics sent to WebSocket clients.');
        }

        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(oee, availability, performance, quality, { group_id: structure.Group_id, edge_node_id: structure.edge_node_id });
            oeeLogger.info('Metrics written to InfluxDB.');
        }

        // Load chart data and send it via WebSocket
        let chartData;
        try {
            chartData = loadDataAndPrepareChart();
        } catch (chartError) {
            errorLogger.error(`Error loading or preparing chart data: ${chartError.message}`);
            return;
        }

        if (wss) {
            const chartPayload = JSON.stringify({ type: 'chartData', data: chartData });
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(chartPayload);
                }
            });
            oeeLogger.info('Chart data sent to WebSocket clients.');
        }

        // Log chart data
        oeeLogger.info(`Chart Data: ${JSON.stringify(chartData)}`);

    } catch (error) {
        errorLogger.error(`Error calculating metrics: ${error.message}`);
    }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };