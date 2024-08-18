const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger, defaultLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../src/oeeCalculator');
const { loadDataAndPrepareOEE } = require('../src/downtimeManager');
const { influxdb } = require('../config/config');
const { setWebSocketServer, sendWebSocketMessage } = require('../websocket/webSocketUtils');
const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'; // Set timezone from .env or default to 'Europe/Berlin'

const oeeCalculators = new Map(); // Map for OEE calculators for each machineId

/**
 * Load machine data from machine.json.
 * @returns {Array} Array of machine objects.
 */
function loadMachineData() {
    const machineDataPath = path.join(__dirname, '../data/machine.json');
    return JSON.parse(fs.readFileSync(machineDataPath, 'utf8'));
}

/**
 * Get plant and area based on the machineId.
 * @param {string} machineId - The ID of the machine.
 * @returns {Object} An object containing the plant and area.
 */
function getPlantAndArea(machineId) {
    const machines = loadMachineData();
    const machine = machines.find(m => m.machine_id === machineId);

    if (machine) {
        return {
            plant: machine.Plant || 'UnknownPlant', // Handle cases where Plant is undefined or null
            area: machine.area || 'UnknownArea' // Handle cases where area is undefined or null
        };
    }

    errorLogger.warn(`Plant and Area not found for machineId: ${machineId}`);
    return {
        plant: 'UnknownPlant',
        area: 'UnknownArea'
    };
}

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

        // Get plant and area information based on machineId
        const { plant, area } = getPlantAndArea(machineId);

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
            throw new Error(`Metrics could not be calculated or are undefined for machineId: ${machineId}.`);
        }

        // Convert StartTime and EndTime to the desired timezone
        const startTimeInTimezone = moment.tz(metrics.StartTime, "UTC").tz(TIMEZONE).format();
        const endTimeInTimezone = moment.tz(metrics.EndTime, "UTC").tz(TIMEZONE).format();

        // Prepare payload with additional details
        const roundedMetrics = {
            oee: Math.round(metrics.oee * 100) / 100,
            availability: Math.round(metrics.availability * 10000) / 100,
            performance: Math.round(metrics.performance * 10000) / 100,
            quality: Math.round(metrics.quality * 10000) / 100,
            level: calculator.classifyOEE(metrics.oee / 100),
            processData: {
                ProcessOrderNumber: metrics.ProcessOrderNumber,
                StartTime: startTimeInTimezone,
                EndTime: endTimeInTimezone,
                plannedProduction: metrics.plannedProduction,
                plannedDowntime: totalTimes.plannedDowntime,
                unplannedDowntime: totalTimes.unplannedDowntime,
                microstops: totalTimes.microstops,
                MaterialNumber: metrics.MaterialNumber,
                MaterialDescription: metrics.MaterialDescription,
                machineId,
                plant, // Include the plant information
                area // Include the area information
            }
        };

        // Log summary
        oeeLogger.info(`OEE Metrics Summary for machine ${machineId}: OEE=${roundedMetrics.oee}%, Availability=${roundedMetrics.availability}%, Performance=${roundedMetrics.performance}%, Quality=${roundedMetrics.quality}%, Level=${roundedMetrics.level}`);
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
        errorLogger.warn(`Error calculating metrics for machine ${machineId}: ${error.message}`);
    }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };