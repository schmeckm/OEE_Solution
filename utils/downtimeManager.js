const { loadJsonData } = require('../utils/helper');
const { oeeLogger, errorLogger } = require('../utils/logger');
const path = require('path');

// Pfade zu den Daten-Dateien
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');

// Caches für die Daten
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;

/**
 * Lädt und cached die ungeplanten Ausfallzeiten.
 * @returns {Object} Die ungeplanten Ausfallzeiten.
 */
async function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = await loadJsonData(unplannedDowntimeFilePath);
        oeeLogger.info(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

/**
 * Lädt und cached die geplanten Ausfallzeiten.
 * @returns {Object} Die geplanten Ausfallzeiten.
 */
async function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = await loadJsonData(plannedDowntimeFilePath);
        oeeLogger.info(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
    }
    return plannedDowntimeCache;
}

/**
 * Akkumuliert die Ausfallzeitdifferenz für eine bestimmte ProcessOrderNumber.
 * @param {string} processOrderNumber - Die ProcessOrderNumber.
 * @returns {number} Die ungeplante Ausfallzeit in Minuten.
 */
async function getunplannedDowntime(processOrderNumber) {
    try {
        const unplannedDowntimeEntries = await loadUnplannedDowntimeData();

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
async function getPlannedDowntime(processOrderNumber, startTime, endTime) {
    try {
        const plannedDowntimeEntries = await loadPlannedDowntimeData();
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

/**
 * Berechnet die gesamte geplante Ausfallzeit (ohne die ProcessOrderNumber).
 * @param {Array} plannedDowntime - Die geplante Ausfallzeitdaten.
 * @param {string} start - Der Startzeitpunkt.
 * @param {string} end - Der Endzeitpunkt.
 * @param {string} lineCode - Der LineCode.
 * @returns {number} Die gesamte geplante Ausfallzeit in Minuten.
 */
function calculateTotalPlannedDowntime(plannedDowntime, start, end, lineCode) {
    try {
        return plannedDowntime.reduce((total, downtime) => {
            if (downtime.lineCode === lineCode && downtime.start >= start && downtime.end <= end) {
                total += downtime.duration;
            }
            return total;
        }, 0);
    } catch (error) {
        errorLogger.error(`Error calculating planned downtime: ${error.message}`);
        throw error;
    }
}

module.exports = { getunplannedDowntime, getPlannedDowntime, calculateTotalPlannedDowntime };