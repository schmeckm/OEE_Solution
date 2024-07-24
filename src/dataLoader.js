const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const dotenv = require('dotenv');
const { oeeLogger, errorLogger } = require('../utils/logger');

// Lade Umgebungsvariablen aus der .env Datei
dotenv.config();

// Pfade zu den Daten-Dateien
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');
const machineStoppagesFilePath = path.resolve(__dirname, '../data/machineStoppages.json');

// Caches für die Daten
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let machineStoppagesCache = null;

// Lese Datumsformat und Zeitzone aus Umgebungsvariablen
const DATE_FORMAT = process.env.DATE_FORMAT || 'YYYY-MM-DDTHH:mm:ss.SSSZ';
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'; // Europe/Berlin wird sowohl für CET als auch für CEST verwendet

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
 * Lädt und cached die ungeplanten Ausfallzeiten.
 * @returns {Object} Die ungeplanten Ausfallzeiten.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath, ['Start', 'End']);
        oeeLogger.info(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

/**
 * Lädt und cached die geplanten Ausfallzeiten.
 * @returns {Object} Die geplanten Ausfallzeiten.
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
 * Akkumuliert die Ausfallzeitdifferenz für eine bestimmte ProcessOrderNumber.
 * @param {string} processOrderNumber - Die ProcessOrderNumber.
 * @returns {number} Die ungeplante Ausfallzeit in Minuten.
 */
function getUnplannedDowntime(processOrderNumber) {
    try {
        const unplannedDowntimeEntries = loadUnplannedDowntimeData();

        // Differenzen für die angegebene ProcessOrderNumber summieren
        const totalDowntimeMinutes = unplannedDowntimeEntries.reduce((total, entry) => {
            if (entry.ProcessOrderNumber === processOrderNumber) {
                total += entry.Differenz;
            }
            return total;
        }, 0);

        // Akkumulierte Ausfallzeit protokollieren
        oeeLogger.info(`Total accumulated unplanned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

/**
 * Berechnet die gesamte geplante Ausfallzeit.
 * @param {string} processOrderNumber - Die ProcessOrderNumber.
 * @param {string} startTime - Der Startzeitpunkt des Prozessauftrags.
 * @param {string} endTime - Der Endzeitpunkt des Prozessauftrags.
 * @returns {number} Die gesamte geplante Ausfallzeit in Minuten.
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
    loadMachineStoppagesData
};