const express = require('express');
const { loadUnplannedDowntime, saveUnplannedDowntime } = require('../services/unplannedDowntimeService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Unplanned Downtime
 *   description: API for managing unplanned downtimes
 */

/**
 * @swagger
 * /unplanneddowntime:
 *   get:
 *     summary: Get all unplanned downtimes
 *     tags: [Unplanned Downtime]
 *     description: Retrieve a list of all unplanned downtimes.
 *     responses:
 *       200:
 *         description: A list of unplanned downtimes.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', (req, res) => {
    const data = loadUnplannedDowntime();
    res.json(data);
});

/**
 * @swagger
 * /unplanneddowntime/{id}:
 *   get:
 *     summary: Get a specific unplanned downtime
 *     tags: [Unplanned Downtime]
 *     description: Retrieve a single unplanned downtime by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unplanned downtime ID.
 *     responses:
 *       200:
 *         description: A specific unplanned downtime object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Unplanned downtime not found.
 */
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

/**
 * @swagger
 * /unplanneddowntime:
 *   post:
 *     summary: Add a new unplanned downtime
 *     tags: [Unplanned Downtime]
 *     description: Create a new unplanned downtime.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ID:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Unplanned downtime added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post('/', (req, res) => {
    const data = loadUnplannedDowntime();
    const newData = req.body;
    data.push(newData);
    saveUnplannedDowntime(data);
    res.status(201).json({ message: 'Unplanned downtime added successfully' });
});

/**
 * @swagger
 * /unplanneddowntime/{id}:
 *   put:
 *     summary: Update an existing unplanned downtime
 *     tags: [Unplanned Downtime]
 *     description: Update the details of an existing unplanned downtime.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unplanned downtime ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unplanned downtime updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Unplanned downtime not found.
 */
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

/**
 * @swagger
 * /unplanneddowntime/{id}:
 *   delete:
 *     summary: Delete an unplanned downtime
 *     tags: [Unplanned Downtime]
 *     description: Remove an unplanned downtime from the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unplanned downtime ID.
 *     responses:
 *       200:
 *         description: Unplanned downtime deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Unplanned downtime not found.
 */
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