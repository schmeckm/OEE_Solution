const fs = require('fs');
const path = require('path');

const PROCESS_ORDER_FILE = path.join(__dirname, '../data/processOrder.json');

// Hilfsfunktion zum Laden der Prozessaufträge
const loadProcessOrders = () => {
    if (fs.existsSync(PROCESS_ORDER_FILE)) {
        const data = fs.readFileSync(PROCESS_ORDER_FILE, 'utf8');
        return JSON.parse(data);
    } else {
        return [];
    }
};

// Hilfsfunktion zum Speichern der Prozessaufträge
const saveProcessOrders = (processOrders) => {
    fs.writeFileSync(PROCESS_ORDER_FILE, JSON.stringify(processOrders, null, 4));
};

module.exports = {
    loadProcessOrders,
    saveProcessOrders
};