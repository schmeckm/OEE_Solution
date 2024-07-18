const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { oeeLogger, errorLogger } = require('../utils/logger');

// Pfade zu den Daten-Dateien
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');

// Caches für die Daten
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;

/**
 * Load JSON data from a file and log its content.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Object} The parsed JSON data.
 */
function loadJsonData(filePath) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        oeeLogger.info(`Content of ${filePath} loaded successfully`);
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Lädt und cached die ungeplanten Ausfallzeiten.
 * @returns {Object} Die ungeplanten Ausfallzeiten.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
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
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
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
        processOrderDataCache = loadJsonData(processOrderFilePath);
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
        shiftModelDataCache = loadJsonData(shiftModelFilePath);
        oeeLogger.info(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

/**
 * Parse a date string into a Moment.js object.
 * @param {string} dateStr - The date string.
 * @returns {Object} Moment.js object.
 */
function parseDate(dateStr) {
    return moment(dateStr);
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
function getunplannedDowntime(processOrderNumber) {
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
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();

        const totalDowntimeMinutes = plannedDowntimeEntries.reduce((total, entry) => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return total; // Skip this entry
            }

            const entryStart = new Date(entry.Start).getTime();
            const entryEnd = new Date(entry.End).getTime();
            oeeLogger.debug(`Processing entry for ProcessOrderNumber ${entry.ProcessOrderNumber}: Start ${entry.Start}, End ${entry.End}`);

            if (entry.ProcessOrderNumber === processOrderNumber && entryStart < end && entryEnd > start) {
                const overlapStart = Math.max(start, entryStart);
                const overlapEnd = Math.min(end, entryEnd);
                const duration = (overlapEnd - overlapStart) / (1000 * 60);
                oeeLogger.debug(`Overlap found: starts at ${new Date(overlapStart)}, ends at ${new Date(overlapEnd)}, duration ${duration} minutes`);
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
    getunplannedDowntime,
    getPlannedDowntime,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadShiftModelData
};