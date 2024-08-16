const express = require('express');
const { loadMachines, saveMachines } = require('../services/machineService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Machines
 *   description: API for managing machines
 */

/**
 * @swagger
 * /machines:
 *   get:
 *     summary: Get all machines
 *     tags: [Machines]
 *     description: Retrieve a list of all machines.
 *     responses:
 *       200:
 *         description: A list of machines.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', (req, res) => {
    const machines = loadMachines();
    res.json(machines);
});

/**
 * @swagger
 * /machines/{id}:
 *   get:
 *     summary: Get a specific machine
 *     tags: [Machines]
 *     description: Retrieve a single machine by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The machine ID.
 *     responses:
 *       200:
 *         description: A machine object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Machine not found.
 */
router.get('/:id', (req, res) => {
    const machines = loadMachines();
    const machine = machines.find(m => m.machine_id === req.params.id);
    if (machine) {
        res.json(machine);
    } else {
        res.status(404).json({ message: `Machine with ID ${req.params.id} not found` });
    }
});

/**
 * @swagger
 * /machines:
 *   post:
 *     summary: Add a new machine
 *     tags: [Machines]
 *     description: Create a new machine.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Machine created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 machine:
 *                   type: object
 */
router.post('/', (req, res) => {
    const machines = loadMachines();
    const newMachine = req.body;
    newMachine.machine_id = (machines.length ? Math.max(...machines.map(m => parseInt(m.machine_id))) + 1 : 1).toString();
    machines.push(newMachine);
    saveMachines(machines);
    res.status(201).json({ message: 'New machine added successfully', machine: newMachine });
});

/**
 * @swagger
 * /machines/{id}:
 *   put:
 *     summary: Update an existing machine
 *     tags: [Machines]
 *     description: Update the details of an existing machine.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The machine ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Machine updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 machine:
 *                   type: object
 *       404:
 *         description: Machine not found.
 */
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

/**
 * @swagger
 * /machines/{id}:
 *   delete:
 *     summary: Delete a machine
 *     tags: [Machines]
 *     description: Remove a machine from the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The machine ID.
 *     responses:
 *       200:
 *         description: Machine deleted successfully.
 *       404:
 *         description: Machine not found.
 */
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