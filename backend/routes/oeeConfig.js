const express = require('express');
const { loadOEEConfig, saveOEEConfig } = require('../services/oeeConfigService');

const router = express.Router();

// API zum Abrufen der gesamten OEE-Konfiguration
router.get('/', (req, res) => {
    const oeeConfig = loadOEEConfig();
    res.json(oeeConfig);
});

// API zum Abrufen einer spezifischen OEE-Konfiguration
router.get('/:key', (req, res) => {
    const oeeConfig = loadOEEConfig();
    const key = req.params.key;
    if (oeeConfig[key] !== undefined) {
        res.json({
            [key]: oeeConfig[key]
        });
    } else {
        res.status(404).json({ message: `Key ${key} not found` });
    }
});

// API zum Hinzufügen einer neuen OEE-Konfiguration
router.post('/', (req, res) => {
    const oeeConfig = loadOEEConfig();
    const newConfig = req.body;
    for (let key in newConfig) {
        oeeConfig[key] = newConfig[key];
    }
    saveOEEConfig(oeeConfig);
    res.status(201).json({ message: 'New OEE configuration added successfully' });
});

// API zum Aktualisieren einer bestehenden OEE-Konfiguration
router.put('/:key', (req, res) => {
    const oeeConfig = loadOEEConfig();
    const key = req.params.key;
    const value = req.body.value;
    if (oeeConfig[key] !== undefined) {
        oeeConfig[key] = value;
        saveOEEConfig(oeeConfig);
        res.status(200).json({ message: `Key ${key} updated successfully` });
    } else {
        res.status(404).json({ message: `Key ${key} not found` });
    }
});

// API zum Löschen einer spezifischen OEE-Konfiguration
router.delete('/:key', (req, res) => {
    const oeeConfig = loadOEEConfig();
    const key = req.params.key;
    if (oeeConfig[key] !== undefined) {
        delete oeeConfig[key];
        saveOEEConfig(oeeConfig);
        res.status(200).json({ message: `Key ${key} deleted successfully` });
    } else {
        res.status(404).json({ message: `Key ${key} not found` });
    }
});

module.exports = router;