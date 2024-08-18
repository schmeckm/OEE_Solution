const fs = require('fs');
const path = require('path');

const MACHINE_FILE = path.join(__dirname, '../data/machine.json');

// Hilfsfunktion zum Laden der Maschinen
const loadMachines = () => {
    if (fs.existsSync(MACHINE_FILE)) {
        const data = fs.readFileSync(MACHINE_FILE, 'utf8');
        return JSON.parse(data);
    } else {
        return [];
    }
};

// Hilfsfunktion zum Speichern der Maschinen
const saveMachines = (machines) => {
    fs.writeFileSync(MACHINE_FILE, JSON.stringify(machines, null, 4));
};

module.exports = {
    loadMachines,
    saveMachines
};