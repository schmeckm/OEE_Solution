const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger, defaultLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../src/oeeCalculator');
const { loadDataAndPrepareOEE } = require('../src/downtimeManager');
const { influxdb } = require('../config/config');
const { setWebSocketServer, sendWebSocketMessage } = require('../websocket/webSocketUtils');
const moment = require('moment-timezone');

const oeeCalculators = new Map(); // Map to store OEE calculators per machine ID

/**
 * Loads machine data from machine.json.
 * @returns {Array} Array of machine objects.
 */
function loadMachineData() {
    const machineDataPath = path.join(__dirname, '../data/machine.json');
    return JSON.parse(fs.readFileSync(machineDataPath, 'utf8'));
}

/**
 * Retrieves the plant and area based on the MachineID.
 * @param {string} machineId - The ID of the machine.
 * @returns {Object} An object containing the plant and area.
 */
function getPlantAndArea(machineId) {
    const machines = loadMachineData();
    const machine = machines.find(m => m.machine_id === machineId);

    if (machine) {
        return {
            plant: machine.Plant || 'UnknownPlant',
            area: machine.area || 'UnknownArea',
            lineId: machine.lineId || 'UnknownLine' // Adding lineId if present
        };
    }

    // Log a warning if Plant, Area, and LineID are not found for the given machineId
    errorLogger.warn(`Plant, Area, and LineID not found for machineId: ${machineId}`);
    return {
        plant: 'UnknownPlant',
        area: 'UnknownArea',
        lineId: 'UnknownLine'
    };
}

/**
 * Logs the current content of the OEE calculators map for debugging purposes.
 */
function debugOeeCalculatorsMap() {
    oeeLogger.info('Debugging OEE Calculators Map:');
    oeeCalculators.forEach((calculator, machineId) => {
        oeeLogger.info(`Machine ID: ${machineId}`);
        oeeLogger.info(`OEE Data: ${JSON.stringify(calculator.getMetrics(machineId), null, 2)}`);
    });
}

/**
 * Logs the current content of the processing map for debugging purposes.
 */
function debugProcessingMap() {
    oeeLogger.info('Debugging Processing Map:');
    processing.forEach((isProcessing, machineId) => {
        oeeLogger.info(`Machine ID: ${machineId}, isProcessing: ${isProcessing}`);
    });
}

/**
 * Updates a metric with a new value and processes it immediately.
 * If the OEECalculator for the machine does not exist, it initializes one.
 * @param {string} name - The name of the metric.
 * @param {number} value - The value of the metric.
 * @param {string} machineId - The MachineID or Workcenter.
 */
function updateMetric(name, value, machineId) {
    let calculator = oeeCalculators.get(machineId);
    if (!calculator) {
        calculator = new OEECalculator();
        // Initialize the calculator and then update the metric
        calculator.init(machineId).then(() => {
            oeeCalculators.set(machineId, calculator);
            calculator.updateData(name, value, machineId);
            debugOeeCalculatorsMap(); // Debugging OEE Calculators Map
            processMetrics(machineId);
        }).catch(error => {
            errorLogger.error(`Error during OEECalculator initialization: ${error.message}`);
        });
    } else {
        calculator.updateData(name, value, machineId);
        debugOeeCalculatorsMap(); // Debugging OEE Calculators Map
        processMetrics(machineId);
    }
}

let processing = new Map(); // Map to keep track of whether a machine's metrics are being processed

/**
 * Processes metrics, calculates OEE, and sends the data via WebSocket only if there are changes, for a specific MachineID.
 * Prevents multiple processes from running for the same machine simultaneously.
 * @param {string} machineId - The MachineID or Workcenter.
 */
async function processMetrics(machineId) {
    // Prevent multiple processes from running for the same machine
    if (processing.get(machineId)) {
        oeeLogger.debug(`Skipping metrics processing for machine ${machineId} as it's already being processed.`);
        return;
    }

    processing.set(machineId, true); // Mark the machine as being processed
    debugProcessingMap(); // Debugging Processing Map

    try {
        oeeLogger.info(`Starting metrics processing for machine: ${machineId}.`);

        let calculator = oeeCalculators.get(machineId);
        if (!calculator) {
            calculator = new OEECalculator();
            await calculator.init(machineId);
            oeeCalculators.set(machineId, calculator);
        }

        const { plant, area, lineId } = getPlantAndArea(machineId);
        const OEEData = loadDataAndPrepareOEE(machineId);

        if (!OEEData || !Array.isArray(OEEData.datasets)) {
            throw new Error('Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array.');
        }

        const totalTimes = OEEData.datasets.reduce((totals, dataset, index) => {
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

        // Validate inputs before calculation
        validateInputData(totalTimes, machineId);

        await calculator.calculateMetrics(machineId, totalTimes.unplannedDowntime, totalTimes.plannedDowntime + totalTimes.breakTime + totalTimes.microstops);

        const metrics = calculator.getMetrics(machineId);
        if (!metrics) {
            throw new Error(`Metrics could not be calculated or are undefined for machineId: ${machineId}.`);
        }

        const roundedMetrics = formatMetrics(metrics, machineId, totalTimes, plant, area, lineId);

        oeeLogger.info(`OEE Metrics Summary for machine ${machineId}: OEE=${roundedMetrics.oee}%, Availability=${roundedMetrics.availability}%, Performance=${roundedMetrics.performance}%, Quality=${roundedMetrics.quality}%, Level=${roundedMetrics.level}`);

        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(roundedMetrics);
            oeeLogger.debug('Metrics written to InfluxDB.');
        }

        sendWebSocketMessage('OEEData', OEEData);
        oeeLogger.debug(`OEE Data: ${JSON.stringify(OEEData)}`);

    } catch (error) {
        errorLogger.warn(`Error calculating metrics for machine ${machineId}: ${error.message}`);
    } finally {
        processing.set(machineId, false); // Mark the machine as no longer being processed
        debugProcessingMap(); // Debugging Processing Map after processing
    }
}

/**
 * Validation function to ensure that the data is valid before calculations.
 * @param {Object} totalTimes - Object containing total production, downtime, and break times.
 * @param {string} machineId - The MachineID or Workcenter.
 */
function validateInputData(totalTimes, machineId) {
    const { unplannedDowntime, plannedDowntime, productionTime } = totalTimes;

    if (productionTime <= 0) {
        // Log a validation error using errorLogger
        throw new Error(`Invalid input data for machine ${machineId}: productionTime must be greater than 0`);
    }

    if (unplannedDowntime < 0 || plannedDowntime < 0) {
        // Log a validation error using errorLogger
        throw new Error(`Invalid input data for machine ${machineId}: downtime values must be non-negative`);
    }
}

/**
 * Formats the metrics into a structured object for logging and database storage.
 * @param {Object} metrics - The metrics object from the OEECalculator.
 * @param {string} machineId - The MachineID or Workcenter.
 * @param {Object} totalTimes - Object containing total production, downtime, and break times.
 * @param {string} plant - The plant associated with the machine.
 * @param {string} area - The area associated with the machine.
 * @param {string} lineId - The lineId associated with the machine.
 * @returns {Object} Formatted metrics.
 */
function formatMetrics(metrics, machineId, totalTimes, plant, area, lineId) {
    return {
        oee: Math.round(metrics.oee * 100) / 100,
        availability: Math.round(metrics.availability * 10000) / 100,
        performance: Math.round(metrics.performance * 10000) / 100,
        quality: Math.round(metrics.quality * 10000) / 100,
        level: metrics.classification, // Use the classification from OEECalculator
        processData: {
            ProcessOrderNumber: metrics.ProcessOrderNumber,
            StartTime: metrics.StartTime,
            EndTime: metrics.EndTime,
            plannedProduction: metrics.plannedProduction,
            plannedDowntime: totalTimes.plannedDowntime,
            unplannedDowntime: totalTimes.unplannedDowntime,
            microstops: totalTimes.microstops,
            MaterialNumber: metrics.MaterialNumber,
            MaterialDescription: metrics.MaterialDescription,
            machineId,
            plant,
            area,
            lineId
        }
    };
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };