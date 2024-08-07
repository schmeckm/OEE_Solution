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

// Caches for data
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let machineStoppagesCache = null;

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
 * Save JSON data to a file.
 * @param {string} filePath - The path to the JSON file.
 * @param {Object} data - The JSON data to save.
 * @param {function} callback - The callback function to execute after saving.
 */
function saveJsonData(filePath, data, callback) {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) {
            errorLogger.error(`Error writing JSON data to ${filePath}: ${err.message}`);
            return callback(err);
        }
        oeeLogger.info(`Data saved successfully to ${filePath}`);
        callback(null);
    });
}

/**
 * Validates process order data.
 * @param {Array} data - The process order data.
 * @returns {Array} The validated process order data.
 */
function validateProcessOrderData(data) {
    data.forEach(order => {
        if (order.goodProducts > order.totalProduction) {
            const errorMsg = `Invalid input data: goodProducts (${order.goodProducts}) cannot be greater than totalProduction (${order.totalProduction})`;
            errorLogger.error(errorMsg);
            throw new Error(errorMsg);
        }
    });
    return data;
}

/**
 * Load and cache unplanned downtime data.
 * @returns {Object} The unplanned downtime data.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath, ['Start', 'End']);
        oeeLogger.info(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
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
        oeeLogger.info(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
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
 * Load machine stoppages data once and cache it.
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
 * Get machine stoppages cache.
 * @returns {Object} The machine stoppages cache.
 */
function getMachineStoppagesCache() {
    if (!machineStoppagesCache) {
        loadMachineStoppagesData();
    }
    return machineStoppagesCache;
}

/**
 * Save machine stoppages data to file.
 * @param {Object} data - The machine stoppages data.
 * @param {function} callback - The callback function to execute after saving.
 */
function saveMachineStoppageData(data, callback) {
    saveJsonData(machineStoppagesFilePath, data, callback);
}

/**
 * Parse a date string into a Moment.js object and convert it to CEST.
 * @param {string} dateStr - The date string.
 * @returns {Object} Moment.js object.
 */
function parseDate(dateStr) {
    const date = moment.tz(dateStr, TIMEZONE);
    if (!date.isValid()) {
        const errorMsg = `Invalid date: ${dateStr}`;
        errorLogger.error(errorMsg);
        throw new Error(errorMsg);
    }
    return date;
}

/**
 * Filter downtimes that fall within the specified start and end times.
 * @param {Array} downtimes - The downtimes data.
 * @param {Object} startTime - The start time.
 * @param {Object} endTime - The end time.
 * @returns {Array} Filtered downtimes.
 */
function filterDowntime(downtimes, startTime, endTime) {
    return downtimes.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        return start.isBetween(startTime, endTime, null, '[]') || end.isBetween(startTime, endTime, null, '[]');
    });
}

/**
 * Accumulate downtime difference for a specific ProcessOrderNumber.
 * @param {string} processOrderNumber - The ProcessOrderNumber.
 * @returns {number} The unplanned downtime in minutes.
 */
function getUnplannedDowntime(processOrderNumber) {
    try {
        const unplannedDowntimeEntries = loadUnplannedDowntimeData();

        // Summarize differences for the specified ProcessOrderNumber
        const totalDowntimeMinutes = unplannedDowntimeEntries.reduce((total, entry) => {
            if (entry.ProcessOrderNumber === processOrderNumber) {
                total += entry.Differenz;
            }
            return total;
        }, 0);

        // Log the accumulated downtime
        oeeLogger.info(`Total accumulated unplanned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

/**
 * Calculate the total planned downtime.
 * @param {string} processOrderNumber - The ProcessOrderNumber.
 * @param {string} startTime - The start time of the process order.
 * @param {string} endTime - The end time of the process order.
 * @returns {number} The total planned downtime in minutes.
 */
function getPlannedDowntime(processOrderNumber, startTime, endTime) {
    try {
        const plannedDowntimeEntries = loadPlannedDowntimeData();
        const start = parseDate(startTime);
        const end = parseDate(endTime);

        const totalDowntimeMinutes = plannedDowntimeEntries.reduce((total, entry) => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return total; // Skip this entry
            }

            const entryStart = parseDate(entry.Start);
            const entryEnd = parseDate(entry.End);
            oeeLogger.debug(`Processing entry for ProcessOrderNumber ${entry.ProcessOrderNumber}: Start ${entry.Start}, End ${entry.End}`);

            if (entry.ProcessOrderNumber === processOrderNumber && entryStart.isBefore(end) && entryEnd.isAfter(start)) {
                const overlapStart = moment.max(start, entryStart);
                const overlapEnd = moment.min(end, entryEnd);
                const duration = overlapEnd.diff(overlapStart, 'minutes');
                oeeLogger.debug(`Overlap found: starts at ${overlapStart.format(DATE_FORMAT)}, ends at ${overlapEnd.format(DATE_FORMAT)}, duration ${duration} minutes`);
                total += duration;
            }
            return total;
        }, 0);

        oeeLogger.info(`Total accumulated planned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing plannedDowntime.json: ${error.message}`);
        throw error;
    }
}

module.exports = {
    getUnplannedDowntime,
    getPlannedDowntime,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadShiftModelData,
    loadMachineStoppagesData,
    getMachineStoppagesCache,
    saveMachineStoppageData
};