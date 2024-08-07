const fs = require('fs');
const path = require('path');

const OEE_CONFIG_FILE = path.join(__dirname, '../config/oeeConfig.json');

// Hilfsfunktion zum Laden der OEE-Konfiguration
const loadOEEConfig = () => {
    if (fs.existsSync(OEE_CONFIG_FILE)) {
        const data = fs.readFileSync(OEE_CONFIG_FILE, 'utf8');
        console.log("OEE Config Loaded:", data); // Protokollierung hinzugefügt
        return JSON.parse(data);
    } else {
        console.log("OEE Config file does not exist."); // Protokollierung hinzugefügt
        return {};
    }
};

// Hilfsfunktion zum Speichern der OEE-Konfiguration
const saveOEEConfig = (config) => {
    fs.writeFileSync(OEE_CONFIG_FILE, JSON.stringify(config, null, 4));
};

module.exports = {
    loadOEEConfig,
    saveOEEConfig
};