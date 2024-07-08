const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger'); // Stellen Sie sicher, dass der Logger korrekt importiert wird

// Module-scoped variables to cache the loaded data
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;

// Pfad zur unplannedDowntime.json Datei
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');

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
        oeeLogger.info(`Geplante Ausfallzeiten aus ${plannedDowntimeFilePath} geladen`);
    }
    return plannedDowntimeCache;
}

/**
 * Akkumuliert die Ausfallzeitdifferenz für eine bestimmte ProcessOrderNumber.
 * @param {string} processOrderNumber - Die ProcessOrderNumber.
 * @returns {number} Die ungeplante Ausfallzeit in Minuten.
 */
function unplannedDowntime(processOrderNumber) {
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
        oeeLogger.info(`Gesamte angesammelte ungeplante Ausfallzeit für ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} Minuten`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Fehler beim Lesen oder Verarbeiten von unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

/**
 * Lädt die geplante Ausfallzeit.
 * @returns {Object} Die geplante Ausfallzeitdaten.
 */
function getPlannedDowntime() {
    try {
        const plannedDowntime = loadPlannedDowntimeData();
        return plannedDowntime;
    } catch (error) {
        errorLogger.error(`Fehler beim Laden der geplanten Ausfallzeiten aus ${plannedDowntimeFilePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Berechnet die gesamte geplante Ausfallzeit.
 * @param {Object} plannedDowntime - Die geplante Ausfallzeitdaten.
 * @param {string} start - Der Startzeitpunkt.
 * @param {string} end - Der Endzeitpunkt.
 * @param {string} lineCode - Der LineCode.
 * @returns {number} Die gesamte geplante Ausfallzeit in Minuten.
 */
function calculateTotalPlannedDowntime(plannedDowntime, start, end, lineCode) {
    try {
        // Implementiere die Logik zur Berechnung der geplanten Ausfallzeit
        // Beispiel:
        return plannedDowntime.reduce((total, downtime) => {
            if (downtime.lineCode === lineCode && downtime.start >= start && downtime.end <= end) {
                total += downtime.duration;
            }
            return total;
        }, 0);
    } catch (error) {
        errorLogger.error(`Fehler bei der Berechnung der geplanten Ausfallzeit: ${error.message}`);
        throw error;
    }
}

module.exports = { getPlannedDowntime, calculateTotalPlannedDowntime, unplannedDowntime };