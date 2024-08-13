const { oeeLogger, errorLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../utils/oeeCalculator');
const { loadDataAndPrepareOEE } = require('../utils/downtimeManager');
const { influxdb } = require('../config/config');
const { setWebSocketServer, sendWebSocketMessage } = require('./webSocketUtils');
const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'; // Set timezone from .env or default to 'Europe/Berlin'

// Initialize OEECalculator and metrics storage for each line
const oeeCalculators = new Map();
const receivedMetrics = new Map();
const metricBatch = [];
const BATCH_SIZE = 10; // Adjust the batch size as needed

/**
 * Update a metric with a new value and batch process the updates.
 * @param {string} name - The metric name.
 * @param {number} value - The metric value.
 * @param {string} line - The production line or workcenter.
 */
function updateMetric(name, value, line) {
    if (!receivedMetrics.has(line)) {
        receivedMetrics.set(line, new Map());
    }
    receivedMetrics.get(line).set(name, value);
    metricBatch.push({ name, value, line });

    if (metricBatch.length >= BATCH_SIZE) {
        processMetricBatch();
    }
}

/**
 * Process a batch of metrics.
 */
function processMetricBatch() {
    metricBatch.forEach(metric => {
        let calculator = oeeCalculators.get(metric.line);
        if (!calculator) {
            calculator = new OEECalculator();
            oeeCalculators.set(metric.line, calculator);
        }
        calculator.updateData(metric.name, metric.value, metric.line);
    });
    metricBatch.length = 0; // Clear the batch after processing
}

/**
 * Process metrics, calculate OEE, and send data via WebSocket for a specific line.
 * @param {string} line - The production line or workcenter.
 */
async function processMetrics(line) {
    try {
        oeeLogger.info(`Starting metrics processing for line: ${line}.`);

        let calculator = oeeCalculators.get(line);
        if (!calculator) {
            calculator = new OEECalculator();
            oeeCalculators.set(line, calculator);
        }

        // Initialize OEE Calculator and load OEE data in parallel
        const [OEEData] = await Promise.all([
            loadDataAndPrepareOEE(),
            calculator.init()
        ]);

        // Calculate the total times from the chart data
        const totalProductionTime = OEEData.datasets[0].data.reduce((a, b) => a + b, 0);
        const totalBreakTime = OEEData.datasets[1].data.reduce((a, b) => a + b, 0);
        const totalUnplannedDowntime = OEEData.datasets[2].data.reduce((a, b) => a + b, 0);
        const totalPlannedDowntime = OEEData.datasets[3].data.reduce((a, b) => a + b, 0);

        oeeLogger.info(`Total production time: ${totalProductionTime}`);
        oeeLogger.info(`Total break time: ${totalBreakTime}`);
        oeeLogger.info(`Total unplanned downtime: ${totalUnplannedDowntime}`);
        oeeLogger.info(`Total planned downtime: ${totalPlannedDowntime}`);

        // Calculate metrics using the new total times
        await calculator.calculateMetrics(line, totalUnplannedDowntime, totalPlannedDowntime + totalBreakTime);

        const metrics = calculator.getMetrics(line);
        if (!metrics) {
            throw new Error(`Metrics could not be calculated or are undefined for line: ${line}.`);
        }

        const { oee, availability, performance, quality, ProcessOrderNumber, StartTime, EndTime, plannedProduction, machine_id, MaterialNumber, MaterialDescription } = metrics;

        const level = calculator.classifyOEE(oee / 100);

        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        // Convert StartTime and EndTime to the desired timezone
        const startTimeInTimezone = moment.tz(StartTime, "UTC").tz(TIMEZONE).format();
        const endTimeInTimezone = moment.tz(EndTime, "UTC").tz(TIMEZONE).format();

        // Prepare payload
        const roundedMetrics = {
            oee: Math.round(oee * 100) / 100,
            availability: Math.round(availability * 10000) / 100,
            performance: Math.round(performance * 10000) / 100,
            quality: Math.round(quality * 10000) / 100,
            level: level,
            processData: {
                ProcessOrderNumber,
                StartTime: startTimeInTimezone,
                EndTime: endTimeInTimezone,
                plannedProduction,
                plannedDowntime: totalPlannedDowntime,
                unplannedDowntime: totalUnplannedDowntime,
                MaterialNumber,
                MaterialDescription,
                machine_id
            }
        };

        // Log summary
        oeeLogger.info(`OEE Metrics Summary for line ${line}: OEE=${roundedMetrics.oee}%, Availability=${roundedMetrics.availability}%, Performance=${roundedMetrics.performance}%, Quality=${roundedMetrics.quality}%, Level=${roundedMetrics.level}`);
        oeeLogger.info(`Process Data: ${JSON.stringify(roundedMetrics.processData)}`);

        // Send OEE metrics to all connected WebSocket clients in a batched manner
        await sendBatchedWebSocketMessages('oeeData', roundedMetrics);

        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(roundedMetrics); // Batch and write the metrics to InfluxDB
            oeeLogger.info('Metrics written to InfluxDB.');
        }

        // Send chart data via WebSocket
        sendWebSocketMessage('OEEData', OEEData);

        // Log chart data
        oeeLogger.info(`Chart Data: ${JSON.stringify(OEEData)}`);

    } catch (error) {
        errorLogger.error(`Error calculating metrics for line ${line}: ${error.message}`);
    }
}

/**
 * Batch and send WebSocket messages to avoid overwhelming the clients.
 * @param {string} type - The message type.
 * @param {Object} data - The data to be sent.
 */
async function sendBatchedWebSocketMessages(type, data) {
    const websocketQueue = [];
    websocketQueue.push({ type, data });

    if (websocketQueue.length >= BATCH_SIZE) {
        websocketQueue.forEach(message => {
            sendWebSocketMessage(message.type, message.data);
        });
        websocketQueue.length = 0; // Clear the queue after sending
    }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };