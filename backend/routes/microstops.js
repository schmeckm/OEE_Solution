const express = require('express');
const { loadMicroStops, saveMicroStops } = require('../services/microstopService');

const router = express.Router();

// API zum Abrufen aller Microstops
router.get('/', (req, res) => {
    const data = loadMicroStops();
    res.json(data);
});

// API zum Abrufen einer spezifischen Microstop
router.get('/:id', (req, res) => {
    const data = loadMicroStops();
    const id = req.params.id;
    const microStop = data.find(d => d.ID === id);
    if (microStop) {
        res.json(microStop);
    } else {
        res.status(404).json({ message: 'Microstop not found' });
    }
});

// API zum Hinzufügen einer neuen Microstop
router.post('/', (req, res) => {
    const data = loadMicroStops();
    const newData = req.body;
    data.push(newData);
    saveMicroStops(data);
    res.status(201).json({ message: 'Microstop added successfully' });
});

// API zum Aktualisieren einer bestehenden Microstop
router.put('/:id', (req, res) => {
    const data = loadMicroStops();
    const id = req.params.id;
    const updatedData = req.body;
    const index = data.findIndex(item => item.ID === id);
    if (index !== -1) {
        data[index] = updatedData;
        saveMicroStops(data);
        res.status(200).json({ message: 'Microstop updated successfully' });
    } else {
        res.status(404).json({ message: 'Microstop not found' });
    }
});

// API zum Löschen einer Microstop
router.delete('/:id', (req, res) => {
    let data = loadMicroStops();
    const initialLength = data.length;
    data = data.filter(item => item.ID !== req.params.id);
    if (data.length !== initialLength) {
        saveMicroStops(data);
        res.status(200).json({ message: 'Microstop deleted successfully' });
    } else {
        res.status(404).json({ message: 'Microstop not found' });
    }
});

module.exports = router;