const express = require('express');
const router = express.Router();
const { loadUnplannedDowntime, saveUnplannedDowntime } = require('../services/unplannedDowntimeService');

router.get('/', (req, res) => {
    const data = loadUnplannedDowntime();
    res.json(data);
});

router.post('/', (req, res) => {
    const data = loadUnplannedDowntime();
    const newData = req.body;
    data.push(newData);
    saveUnplannedDowntime(data);
    res.status(201).json({ message: 'Unplanned downtime added successfully' });
});

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

router.delete('/:id', (req, res) => {
    const data = loadUnplannedDowntime();
    const id = req.params.id;
    const newData = data.filter(item => item.ID !== id);
    if (data.length !== newData.length) {
        saveUnplannedDowntime(newData);
        res.status(200).json({ message: 'Unplanned downtime deleted successfully' });
    } else {
        res.status(404).json({ message: 'Unplanned downtime not found' });
    }
});

module.exports = router;