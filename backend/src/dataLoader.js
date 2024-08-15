const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const dotenv = require('dotenv');
const { oeeLogger, errorLogger } = require('../utils/logger');

// Load environment variables from .env file
dotenv.config();

// Paths to data files
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');
const machineStoppagesFilePath = path.resolve(__dirname, '../data/machineStoppages.json');
const machineFilePath = path.resolve(__dirname, '../data/machine.json'); // Pfad zu machine.json

// Caches for data
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let machineStoppagesCache = null;
let machineDataCache = null; // Cache für machine.json

// Load date format and timezone from environment variables
const DATE_FORMAT = process.env.DATE_FORMAT || 'YYYY-MM-DDTHH:mm:ss.SSSZ';
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'; // Europe/Berlin is used for both CET and CEST

/**
 * Load JSON data from a file and convert date strings to the specified timezone.
 * @param {string} filePath - The path to the JSON file.
 * @param {Array<string>} dateFields - The fields that contain date strings.
 * @returns {Object} The parsed and converted JSON data.
 */
function loadJsonData(filePath, dateFields = []) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);

        // Convert date fields to the specified timezone
        if (dateFields.length > 0) {
            jsonData.forEach(item => {
                dateFields.forEach(field => {
                    if (item[field]) {
                        item[field] = moment.tz(item[field], 'UTC').tz(TIMEZONE).format(DATE_FORMAT);
                    }
                });
            });
        }

        oeeLogger.info(`Content of ${filePath} loaded and converted successfully`);
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Load and cache machine data.
 * @returns {Object} The machine data.
 */
function loadMachineData() {
    if (!machineDataCache) {
        machineDataCache = loadJsonData(machineFilePath); // Lade machine.json
        oeeLogger.debug(`Machine data loaded from ${machineFilePath}`);
    }
    return machineDataCache;
}

/**
 * Load and cache unplanned downtime data.
 * @returns {Object} The unplanned downtime data.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath, ['Start', 'End']);
        oeeLogger.debug(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

/**
 * Load and cache planned downtime data.
 * @returns {Object} The planned downtime data.
 */
function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath, ['Start', 'End']);
        oeeLogger.debug(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
    }
    return plannedDowntimeCache;
}

/**
 * Load process order data once and cache it.
 * @returns {Object} The process order data.
 */
function loadProcessOrderData() {
    if (!processOrderDataCache) {
        let processOrderData = loadJsonData(processOrderFilePath, ['Start', 'End']);

        // Log the loaded data
        oeeLogger.info(`Loaded process order data: ${JSON.stringify(processOrderData, null, 2)}`);

        processOrderData = validateProcessOrderData(processOrderData);
        processOrderDataCache = processOrderData;
        oeeLogger.info(`Process order data loaded from ${processOrderFilePath}`);
    }
    return processOrderDataCache;
}


/**
 * Load shift model data once and cache it.
 * @returns {Object} The shift model data.
 */
function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath, ['Start', 'End']);
        oeeLogger.info(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

/**
 * Load and cache machine stoppages data.
 * @returns {Object} The machine stoppages data.
 */
function loadMachineStoppagesData() {
    if (!machineStoppagesCache) {
        machineStoppagesCache = loadJsonData(machineStoppagesFilePath, ['Start', 'End']);
        oeeLogger.info(`Machine stoppages data loaded from ${machineStoppagesFilePath}`);
    }
    return machineStoppagesCache;
}

/**
 * Validate process order data.
 * @param {Array} data - The process order data.
 * @returns {Array} The validated process order data.
 */
function validateProcessOrderData(data) {
    data.forEach(order => {
        oeeLogger.info(`Validating process order: ProcessOrderNumber=${order.ProcessOrderNumber}, MaterialNumber=${order.MaterialNumber}`);
        if (!order.ProcessOrderNumber || !order.MaterialNumber || !order.MaterialDescription) {
            const errorMsg = `Invalid process order data: Missing essential fields in order ${JSON.stringify(order)}`;
            errorLogger.error(errorMsg);
            throw new Error(errorMsg);
        }
        if (order.goodProducts > order.totalProduction) {
            const errorMsg = `Invalid input data: goodProducts (${order.goodProducts}) cannot be greater than totalProduction (${order.totalProduction})`;
            errorLogger.error(errorMsg);
            throw new Error(errorMsg);
        }
    });
    return data;
}

/**
 * Get unplanned downtime for a specific machine
 * @param {string} machineId - The machine ID
 * @param {string} startTime - The start time of the process order
 * @param {string} endTime - The end time of the process order
 * @returns {number} - The total unplanned downtime in minutes
 */
function getUnplannedDowntimeByMachine(machineId, startTime, endTime) {
    const unplannedDowntimes = loadUnplannedDowntimeData();
    const start = moment(startTime);
    const end = moment(endTime);

    return unplannedDowntimes
        .filter(entry => entry.machine_id === machineId)
        .reduce((total, entry) => {
            const entryStart = moment(entry.Start);
            const entryEnd = moment(entry.End);

            if (entryEnd.isAfter(start) && entryStart.isBefore(end)) {
                const overlapStart = moment.max(start, entryStart);
                const overlapEnd = moment.min(end, entryEnd);
                total += overlapEnd.diff(overlapStart, 'minutes');
            }
            return total;
        }, 0);
}

/**
 * Get planned downtime for a specific machine
 * @param {string} machineId - The machine ID
 * @param {string} startTime - The start time of the process order
 * @param {string} endTime - The end time of the process order
 * @returns {number} - The total planned downtime in minutes
 */
function getPlannedDowntimeByMachine(machineId, startTime, endTime) {
    const plannedDowntimes = loadPlannedDowntimeData();
    const start = moment(startTime);
    const end = moment(endTime);

    return plannedDowntimes
        .filter(entry => entry.machine_id === machineId)
        .reduce((total, entry) => {
            const entryStart = moment(entry.Start);
            const entryEnd = moment(entry.End);

            if (entryEnd.isAfter(start) && entryStart.isBefore(end)) {
                const overlapStart = moment.max(start, entryStart);
                const overlapEnd = moment.min(end, entryEnd);
                total += overlapEnd.diff(overlapStart, 'minutes');
            }
            return total;
        }, 0);
}

/**
 * Get total machine stoppage time for a specific process order.
 * @param {string} processOrderNumber - The process order number.
 * @returns {number} - The total machine stoppage time in minutes.
 */
function getTotalMachineStoppageTimeByProcessOrder(processOrderNumber) {
    const stoppages = loadMachineStoppagesData();
    return stoppages
        .filter(stoppage => stoppage.ProcessOrderNumber === processOrderNumber)
        .reduce((total, stoppage) => {
            total += stoppage.Differenz; // Summiere die Differenz (in Sekunden)
            return total;
        }, 0) / 60; // Rückgabe in Minuten
}

/**
 * Get total machine stoppage time for a specific machine and period.
 * @param {string} machineId - The machine ID.
 * @param {string} startTime - The start time.
 * @param {string} endTime - The end time.
 * @returns {number} - The total machine stoppage time in minutes.
 */
function getTotalMachineStoppageTimeByLineAndPeriod(machineId, startTime, endTime) {
    const stoppages = loadMachineStoppagesData();
    const start = moment(startTime);
    const end = moment(endTime);

    return stoppages
        .filter(stoppage => stoppage.machine_id === machineId && moment(stoppage.Start).isBetween(start, end, null, '[]'))
        .reduce((total, stoppage) => {
            total += stoppage.Differenz; // Summiere die Differenz (in Sekunden)
            return total;
        }, 0) / 60; // Rückgabe in Minuten
}

module.exports = {
    getUnplannedDowntimeByMachine,
    getPlannedDowntimeByMachine,
    getTotalMachineStoppageTimeByProcessOrder,
    getTotalMachineStoppageTimeByLineAndPeriod,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadMachineData,
    loadMachineStoppagesData,
    validateProcessOrderData
};