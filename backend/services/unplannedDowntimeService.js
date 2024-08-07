const fs = require('fs');
const path = require('path');

const UNPLANNED_DOWNTIME_FILE = path.join(__dirname, '../data/unplannedDowntime.json');

// Hilfsfunktion zum Laden der ungeplanten Ausfallzeiten
const loadUnplannedDowntime = () => {
    if (fs.existsSync(UNPLANNED_DOWNTIME_FILE)) {
        const data = fs.readFileSync(UNPLANNED_DOWNTIME_FILE, 'utf8');
        return JSON.parse(data);
    } else {
        return [];
    }
};

// Hilfsfunktion zum Speichern der ungeplanten Ausfallzeiten
const saveUnplannedDowntime = (downtimes) => {
    fs.writeFileSync(UNPLANNED_DOWNTIME_FILE, JSON.stringify(downtimes, null, 4));
};

module.exports = {
    loadUnplannedDowntime,
    saveUnplannedDowntime
};