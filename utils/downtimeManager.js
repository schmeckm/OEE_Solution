const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger'); // Korrigiert Pfad

function getPlannedDowntime() {
    try {
        const data = fs.readFileSync(path.resolve('./data/plannedDowntime.json'), 'utf8');
        const plannedDowntime = JSON.parse(data);
        oeeLogger.info(`Planned downtime data loaded from ./data/plannedDowntime.json`);
        return plannedDowntime;
    } catch (error) {
        errorLogger.error(`Error loading planned downtime from ./data/plannedDowntime.json: ${error.message}`);
        throw error;
    }
}

function calculateTotalPlannedDowntime(plannedDowntime, start, end, lineCode) {
    // Implementieren Sie die Logik zur Berechnung der geplanten Ausfallzeiten
    // Beispiel:
    return plannedDowntime.reduce((total, downtime) => {
        if (downtime.lineCode === lineCode && downtime.start >= start && downtime.end <= end) {
            total += downtime.duration;
        }
        return total;
    }, 0);
}

module.exports = { getPlannedDowntime, calculateTotalPlannedDowntime };