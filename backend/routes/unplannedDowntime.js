const express = require('express');
const { loadUnplannedDowntime, saveUnplannedDowntime } = require('../services/unplannedDowntimeService');

const router = express.Router();

// API zum Abrufen aller ungeplanten Ausfallzeiten
router.get('/', (req, res) => {
    const data = loadUnplannedDowntime();
    res.json(data);
});

// API zum Abrufen einer spezifischen ungeplanten Ausfallzeit
router.get('/:id', (req, res) => {
    const data = loadUnplannedDowntime();
    const id = req.params.id;
    const downtime = data.find(d => d.ID === id);
    if (downtime) {
        res.json(downtime);
    } else {
        res.status(404).json({ message: 'Unplanned downtime not found' });
    }
});

// API zum Hinzufügen einer neuen ungeplanten Ausfallzeit
router.post('/', (req, res) => {
    const data = loadUnplannedDowntime();
    const newData = req.body;
    data.push(newData);
    saveUnplannedDowntime(data);
    res.status(201).json({ message: 'Unplanned downtime added successfully' });
});

// API zum Aktualisieren einer bestehenden ungeplanten Ausfallzeit
router.put('/:id', (req, res) => {
    const data = loadUnplannedDowntime();
    const id = req.params.id;
    const updatedData = req.body;
    const index = data.findIndex(item => item.ID === id);
    if (index !== -1) {
        data[index] = updatedData;
        saveUnplannedDowntime(data);
        res.status(200).json({ message: 'Unplanned downtime updated successfully' });
    } else {
        res.status(404).json({ message: 'Unplanned downtime not found' });
    }
});

// API zum Löschen einer ungeplanten Ausfallzeit
router.delete('/:id', (req, res) => {
    let data = loadUnplannedDowntime();
    const initialLength = data.length;
    data = data.filter(item => item.ID !== req.params.id);
    if (data.length !== initialLength) {
        saveUnplannedDowntime(data);
        res.status(200).json({ message: 'Unplanned downtime deleted successfully' });
    } else {
        res.status(404).json({ message: 'Unplanned downtime not found' });
    }
});

module.exports = router;