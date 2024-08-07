const express = require('express');
const { loadShiftModels, saveShiftModels } = require('../services/shiftmodelService'); // Importieren des Shiftmodel-Dienstes

const router = express.Router();

// API zum Abrufen aller Shiftmodelle
router.get('/', (req, res) => {
    const shiftModels = loadShiftModels();
    res.json(shiftModels);
});

// API zum Abrufen eines spezifischen Shiftmodells
router.get('/:id', (req, res) => {
    const shiftModels = loadShiftModels();
    const shiftModel = shiftModels.find(sm => sm.shift_id === parseInt(req.params.id));
    if (shiftModel) {
        res.json(shiftModel);
    } else {
        res.status(404).json({ message: `Shift model with ID ${req.params.id} not found` });
    }
});

// API zum Hinzufügen eines neuen Shiftmodells
router.post('/', (req, res) => {
    const shiftModels = loadShiftModels();
    const newShiftModel = req.body;
    newShiftModel.shift_id = shiftModels.length ? Math.max(...shiftModels.map(sm => sm.shift_id)) + 1 : 1;
    shiftModels.push(newShiftModel);
    saveShiftModels(shiftModels);
    res.status(201).json({ message: 'New shift model added successfully', shiftModel: newShiftModel });
});

// API zum Aktualisieren eines bestehenden Shiftmodells
router.put('/:id', (req, res) => {
    const shiftModels = loadShiftModels();
    const index = shiftModels.findIndex(sm => sm.shift_id === parseInt(req.params.id));
    if (index !== -1) {
        shiftModels[index] = {...shiftModels[index], ...req.body };
        saveShiftModels(shiftModels);
        res.status(200).json({ message: 'Shift model updated successfully', shiftModel: shiftModels[index] });
    } else {
        res.status(404).json({ message: `Shift model with ID ${req.params.id} not found` });
    }
});

// API zum Löschen eines Shiftmodells
router.delete('/:id', (req, res) => {
    let shiftModels = loadShiftModels();
    const initialLength = shiftModels.length;
    shiftModels = shiftModels.filter(sm => sm.shift_id !== parseInt(req.params.id));
    if (shiftModels.length !== initialLength) {
        saveShiftModels(shiftModels);
        res.status(200).json({ message: 'Shift model deleted successfully' });
    } else {
        res.status(404).json({ message: `Shift model with ID ${req.params.id} not found` });
    }
});

module.exports = router;