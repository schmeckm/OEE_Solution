const express = require('express');
const { loadMachines, saveMachines } = require('../services/machineService'); // Import the machine service

const router = express.Router();

// API zum Abrufen aller Maschinen
router.get('/', (req, res) => {
    const machines = loadMachines();
    res.json(machines);
});

// API zum Abrufen einer spezifischen Maschine
router.get('/:id', (req, res) => {
    const machines = loadMachines();
    const machine = machines.find(m => m.machine_id === req.params.id);
    if (machine) {
        res.json(machine);
    } else {
        res.status(404).json({ message: `Machine with ID ${req.params.id} not found` });
    }
});

// API zum Hinzufügen einer neuen Maschine
router.post('/', (req, res) => {
    const machines = loadMachines();
    const newMachine = req.body;
    newMachine.machine_id = (machines.length ? Math.max(...machines.map(m => parseInt(m.machine_id))) + 1 : 1).toString();
    machines.push(newMachine);
    saveMachines(machines);
    res.status(201).json({ message: 'New machine added successfully', machine: newMachine });
});

// API zum Aktualisieren einer bestehenden Maschine
router.put('/:id', (req, res) => {
    const machines = loadMachines();
    const index = machines.findIndex(m => m.machine_id === req.params.id);
    if (index !== -1) {
        machines[index] = {...machines[index], ...req.body };
        saveMachines(machines);
        res.status(200).json({ message: 'Machine updated successfully', machine: machines[index] });
    } else {
        res.status(404).json({ message: `Machine with ID ${req.params.id} not found` });
    }
});

// API zum Löschen einer Maschine
router.delete('/:id', (req, res) => {
    let machines = loadMachines();
    const initialLength = machines.length;
    machines = machines.filter(m => m.machine_id !== req.params.id);
    if (machines.length !== initialLength) {
        saveMachines(machines);
        res.status(200).json({ message: 'Machine deleted successfully' });
    } else {
        res.status(404).json({ message: `Machine with ID ${req.params.id} not found` });
    }
});

module.exports = router;