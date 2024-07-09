const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger'); // Ensure the logger is correctly imported

// Module-scoped variables to cache the loaded data
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let machineDataCache = null;
let errorDataCache = null;
let shiftModelDataCache = null;

// Paths to data files
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const machineFilePath = path.resolve(__dirname, '../data/Machine.json');
const errorFilePath = path.resolve(__dirname, '../data/error.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');

/**
 * Load JSON data from a file and print its content to the console.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Object} The parsed JSON data.
 */
function loadJsonData(filePath) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        oeeLogger.info(`Content of ${filePath} loaded successfully`);
        console.log(`Content of ${filePath}:`, JSON.stringify(jsonData, null, 2)); // Display the content in the console
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Load process order data once and cache it.
 * @returns {Object} The process order data.
 */
function loadProcessOrderData() {
    if (!processOrderDataCache) {
        processOrderDataCache = loadJsonData(processOrderFilePath);
        oeeLogger.info(`Process order data loaded from ${processOrderFilePath}`);
    }
    return processOrderDataCache;
}

/**
 * Load unplanned downtime data once and cache it.
 * @returns {Object} The unplanned downtime data.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
        oeeLogger.info(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

/**
 * Load planned downtime data once and cache it.
 * @returns {Object} The planned downtime data.
 */
function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
        oeeLogger.info(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
    }
    return plannedDowntimeCache;
}

/**
 * Load machine data once and cache it.
 * @returns {Object} The machine data.
 */
function loadMachineData() {
    if (!machineDataCache) {
        machineDataCache = loadJsonData(machineFilePath);
        oeeLogger.info(`Machine data loaded from ${machineFilePath}`);
    }
    return machineDataCache;
}

/**
 * Load error data once and cache it.
 * @returns {Object} The error data.
 */
function loadErrorData() {
    if (!errorDataCache) {
        errorDataCache = loadJsonData(errorFilePath);
        oeeLogger.info(`Error data loaded from ${errorFilePath}`);
    }
    return errorDataCache;
}

/**
 * Load shift model data once and cache it.
 * @returns {Object} The shift model data.
 */
function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath);
        oeeLogger.info(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

/**
 * Load and log all JSON data at startup for verification.
 */
function loadAllData() {
    loadProcessOrderData();
    loadUnplannedDowntimeData();
    loadPlannedDowntimeData();
    loadMachineData();
    loadErrorData();
    loadShiftModelData();
}

// Load all data on startup
loadAllData();

/**
 * Accumulate downtime difference for a specific ProcessOrderNumber.
 * @param {string} processOrderNumber - The ProcessOrderNumber.
 * @returns {number} The unplanned downtime in minutes.
 */
function unplannedDowntime(processOrderNumber) {
    try {
        const unplannedDowntimeEntries = loadUnplannedDowntimeData();
        console.log(`Loaded unplanned downtime entries: ${JSON.stringify(unplannedDowntimeEntries, null, 2)}`); // Debugging log

        // Summarize differences for the given ProcessOrderNumber
        const totalDowntimeMinutes = unplannedDowntimeEntries.reduce((total, entry) => {
            console.log(`Processing entry: ${JSON.stringify(entry, null, 2)}`); // Debugging log
            if (entry.ProcessOrderNumber === processOrderNumber) {
                total += entry.Differenz;
            }
            return total;
        }, 0);

        // Log accumulated downtime
        oeeLogger.info(`Total accumulated unplanned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

/**
 * Load planned downtime.
 * @returns {Object} The planned downtime data.
 */
function getPlannedDowntime() {
    try {
        const plannedDowntime = loadPlannedDowntimeData();
        return plannedDowntime;
    } catch (error) {
        errorLogger.error(`Error loading planned downtime from ${plannedDowntimeFilePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Calculate the total planned downtime.
 * @param {Object} plannedDowntime - The planned downtime data.
 * @param {string} start - The start time.
 * @param {string} end - The end time.
 * @param {string} lineCode - The line code.
 * @returns {number} The total planned downtime in minutes.
 */
function calculateTotalPlannedDowntime(plannedDowntime, start, end, lineCode) {
    try {
        // Implement logic to calculate planned downtime
        // Example:
        return plannedDowntime.reduce((total, downtime) => {
            if (downtime.LineCode === lineCode && downtime.start >= start && downtime.end <= end) {
                total += (new Date(downtime.end) - new Date(downtime.start)) / (1000 * 60); // Duration in minutes
            }
            return total;
        }, 0);
    } catch (error) {
        errorLogger.error(`Error calculating planned downtime: ${error.message}`);
        throw error;
    }
}

module.exports = {
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadMachineData,
    loadErrorData,
    loadShiftModelData,
    getPlannedDowntime,
    calculateTotalPlannedDowntime,
    unplannedDowntime
};