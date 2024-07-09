const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger');

// Module-scoped variables to cache the loaded data
let processOrderDataCache = null;
let plannedDowntimeDataCache = null;
let machineDataCache = null;
let unplannedDowntimeDataCache = null;
let errorCache = null;

/**
 * Load JSON data from a file.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Object} The parsed JSON data.
 */
function loadJsonData(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
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
        const processOrderFilePath = path.join(__dirname, '../data/processorder.json');
        processOrderDataCache = loadJsonData(processOrderFilePath);
        oeeLogger.info(`Process order data loaded from ${processOrderFilePath}`);
    }
    return processOrderDataCache;
}

/**
 * Load planned downtime data once and cache it.
 * @returns {Object} The planned downtime data.
 */
function loadPlannedDowntimeData() {
    if (!plannedDowntimeDataCache) {
        const plannedDowntimeFilePath = path.join(__dirname, '../data/plannedDowntime.json');
        plannedDowntimeDataCache = loadJsonData(plannedDowntimeFilePath);
        oeeLogger.info(`Geplante Ausfallzeiten aus ${plannedDowntimeFilePath} geladen`);
    }
    return plannedDowntimeDataCache;
}

/**
 * Load unplanned downtime data once and cache it.
 * @returns {Object} The unplanned downtime data.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeDataCache) {
        const unplannedDowntimeFilePath = path.join(__dirname, '../data/unplannedDowntime.json');
        unplannedDowntimeDataCache = loadJsonData(unplannedDowntimeFilePath);
        oeeLogger.info(`Ungeplante Ausfallzeiten aus ${unplannedDowntimeFilePath} geladen`);
    }
    return unplannedDowntimeDataCache;
}

/**
 * Load machine data once and cache it.
 * @returns {Object} The machine data.
 */
function loadMachineData() {
    if (!machineDataCache) {
        const machineFilePath = path.join(__dirname, '../data/machine.json');
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
    if (!errorCache) {
        const errorFilePath = path.join(__dirname, '../data/error.json');
        errorCache = loadJsonData(errorFilePath);
        oeeLogger.info(`Error data loaded from ${errorFilePath}`);
    }
    return errorCache;
}

module.exports = {
    loadProcessOrderData,
    loadPlannedDowntimeData,
    loadUnplannedDowntimeData,
    loadMachineData,
    loadErrorData
};