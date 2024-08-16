const fs = require('fs');
const path = require('path');

const UNPLANNED_DOWNTIME_FILE = path.join(__dirname, '../data/plannedDowntime.json');

// Hilfsfunktion zum Laden der unplanmäßigen Ausfallzeiten
const loadPlannedDowntime = () => {
    if (fs.existsSync(UNPLANNED_DOWNTIME_FILE)) {
        const data = fs.readFileSync(UNPLANNED_DOWNTIME_FILE, 'utf8');
        return JSON.parse(data);
    } else {
        return [];
    }
};

// Hilfsfunktion zum Speichern der unplanmäßigen Ausfallzeiten
const savePlannedDowntime = (downtimes) => {
    fs.writeFileSync(UNPLANNED_DOWNTIME_FILE, JSON.stringify(downtimes, null, 4));
};

module.exports = {
    loadPlannedDowntime,
    savePlannedDowntime
};