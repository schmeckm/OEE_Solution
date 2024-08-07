const express = require('express');
const { loadEnvConfig, saveEnvConfig } = require('../services/settingsService');

const router = express.Router();

// API zum Abrufen der gesamten `.env` Konfiguration
router.get('/env', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        res.json(envConfig);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// API zum Aktualisieren der gesamten `.env` Konfiguration
router.put('/env', (req, res) => {
    try {
        const newEnvConfig = req.body;
        saveEnvConfig(newEnvConfig);
        res.status(200).json({ message: 'Environment configuration updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// API zum Abrufen eines spezifischen Umgebungswertes
router.get('/env/:key', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const key = req.params.key;
        if (envConfig[key] !== undefined) {
            res.json({
                [key]: envConfig[key]
            });
        } else {
            res.status(404).json({ message: `Key ${key} not found` });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// API zum Aktualisieren eines spezifischen Umgebungswertes
router.put('/env/:key', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const key = req.params.key;
        const value = req.body.value;
        envConfig[key] = value;
        saveEnvConfig(envConfig);
        res.status(200).json({ message: `Key ${key} updated successfully` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// API zum Hinzufügen eines neuen Konfigurationswertes
router.post('/env', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const newConfig = req.body;
        for (let key in newConfig) {
            envConfig[key] = newConfig[key];
        }
        saveEnvConfig(envConfig);
        res.status(201).json({ message: 'New configuration added successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// API zum Löschen eines spezifischen Umgebungswertes
router.delete('/env/:key', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const key = req.params.key;
        if (envConfig[key] !== undefined) {
            delete envConfig[key];
            saveEnvConfig(envConfig);
            res.status(200).json({ message: `Key ${key} deleted successfully` });
        } else {
            res.status(404).json({ message: `Key ${key} not found` });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;