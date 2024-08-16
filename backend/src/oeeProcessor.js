const { oeeLogger, errorLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../src/oeeCalculator');
const { loadDataAndPrepareOEE } = require('../src/downtimeManager');
const { influxdb } = require('../config/config');
const { setWebSocketServer, sendWebSocketMessage } = require('../websocket/webSocketUtils');
const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'; // Set timezone from .env or default to 'Europe/Berlin'

const oeeCalculators = new Map(); // Map for OEE calculators for each machineId

/**
 * Update a metric with a new value and process it immediately.
 * @param {string} name - The metric name.
 * @param {number} value - The metric value.
 * @param {string} machineId - The machineId or workcenter.
 */
function updateMetric(name, value, machineId) {
    let calculator = oeeCalculators.get(machineId);
    if (!calculator) {
        calculator = new OEECalculator();
        oeeCalculators.set(machineId, calculator);
    }
    calculator.updateData(name, value, machineId);

    // Process the metric immediately
    processMetrics(machineId);
}

/**
 * Process metrics, calculate OEE, and send data via WebSocket for a specific machineId.
 * @param {string} machineId - The machineId or workcenter.
 */
async function processMetrics(machineId) {
    try {
        oeeLogger.info(`Starting metrics processing for machine: ${machineId}.`);

        let calculator = oeeCalculators.get(machineId);
        if (!calculator) {
            calculator = new OEECalculator();
            oeeCalculators.set(machineId, calculator);
        }

        // Initialize OEE Calculator and load OEE data in parallel
        const OEEData = loadDataAndPrepareOEE(machineId);

        if (!OEEData || !Array.isArray(OEEData.datasets)) {
            throw new Error('Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array.');
        }

        // Calculate total times from the chart data, now including microstops
        const totalTimes = OEEData.datasets.reduce((totals, dataset, index) => {
            if (!Array.isArray(dataset.data)) {
                throw new Error(`Invalid dataset found at index ${index}. Expected an array in dataset.data.`);
            }

            const total = dataset.data.reduce((a, b) => a + b, 0);
            switch (index) {
                case 0:
                    totals.productionTime = total;
                    break;
                case 1:
                    totals.breakTime = total;
                    break;
                case 2:
                    totals.unplannedDowntime = total;
                    break;
                case 3:
                    totals.plannedDowntime = total;
                    break;
                case 4:
                    totals.microstops = total;
                    break;
                default:
                    break;
            }
            return totals;
        }, { productionTime: 0, breakTime: 0, unplannedDowntime: 0, plannedDowntime: 0, microstops: 0 });

        oeeLogger.info(`Total production time: ${totalTimes.productionTime}`);
        oeeLogger.info(`Total break time: ${totalTimes.breakTime}`);
        oeeLogger.info(`Total unplanned downtime: ${totalTimes.unplannedDowntime}`);
        oeeLogger.info(`Total planned downtime: ${totalTimes.plannedDowntime}`);
        oeeLogger.info(`Total microstops: ${totalTimes.microstops}`);

        // Calculate metrics using the new total times, now including microstops in the downtime
        await calculator.calculateMetrics(machineId, totalTimes.unplannedDowntime, totalTimes.plannedDowntime + totalTimes.breakTime + totalTimes.microstops);

        const metrics = calculator.getMetrics(machineId);
        if (!metrics) {
            throw new Error(`Metrics could not be calculated or are undefined for line: ${machineId}.`);
        }

        const { oee, availability, performance, quality, ProcessOrderNumber, StartTime, EndTime, plannedProduction, machine_Id, MaterialNumber, MaterialDescription } = metrics;
        const level = calculator.classifyOEE(oee / 100);

        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        // Convert StartTime and EndTime to the desired timezone
        const startTimeInTimezone = moment.tz(StartTime, "UTC").tz(TIMEZONE).format();
        const endTimeInTimezone = moment.tz(EndTime, "UTC").tz(TIMEZONE).format();

        // Prepare payload with additional details
        const roundedMetrics = {
            oee: Math.round(oee * 100) / 100,
            availability: Math.round(availability * 10000) / 100,
            performance: Math.round(performance * 10000) / 100,
            quality: Math.round(quality * 10000) / 100,
            level,
            processData: {
                ProcessOrderNumber,
                StartTime: startTimeInTimezone,
                EndTime: endTimeInTimezone,
                plannedProduction,
                plannedDowntime: totalTimes.plannedDowntime,
                unplannedDowntime: totalTimes.unplannedDowntime,
                microstops: totalTimes.microstops,
                MaterialNumber,
                MaterialDescription,
                machineId
            }
        };

        // Log summary
        oeeLogger.info(`OEE Metrics Summary for line ${machineId}: OEE=${roundedMetrics.oee}%, Availability=${roundedMetrics.availability}%, Performance=${roundedMetrics.performance}%, Quality=${roundedMetrics.quality}%, Level=${roundedMetrics.level}`);
        oeeLogger.info(`Process Data: ${JSON.stringify(roundedMetrics.processData)}`);

        // Write metrics to InfluxDB if configured
        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(roundedMetrics);
            oeeLogger.debug('Metrics written to InfluxDB.');
        }

        // Send chart data via WebSocket
        sendWebSocketMessage('OEEData', OEEData);
        oeeLogger.debug(`Chart Data: ${JSON.stringify(OEEData)}`);

    } catch (error) {
        errorLogger.warn(`Error calculating metrics for line ${machineId}: ${error.message}`);
    }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };