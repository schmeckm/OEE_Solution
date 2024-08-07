const fs = require('fs');
const path = require('path');

const SHIFT_MODEL_FILE = path.join(__dirname, '../data/shiftModel.json');

// Hilfsfunktion zum Laden der Shiftmodelle
const loadShiftModels = () => {
    if (fs.existsSync(SHIFT_MODEL_FILE)) {
        const data = fs.readFileSync(SHIFT_MODEL_FILE, 'utf8');
        return JSON.parse(data);
    } else {
        return [];
    }
};

// Hilfsfunktion zum Speichern der Shiftmodelle
const saveShiftModels = (shiftModels) => {
    fs.writeFileSync(SHIFT_MODEL_FILE, JSON.stringify(shiftModels, null, 4));
};

module.exports = {
    loadShiftModels,
    saveShiftModels
};