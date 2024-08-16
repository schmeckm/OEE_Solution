const express = require('express');
const { loadPlannedDowntime, savePlannedDowntime } = require('../services/plannedDowntimeService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Planned Downtime
 *   description: API for managing planned downtimes
 */

/**
 * @swagger
 * /planneddowntime:
 *   get:
 *     summary: Get all planned downtimes
 *     tags: [Planned Downtime]
 *     description: Retrieve a list of all planned downtimes.
 *     responses:
 *       200:
 *         description: A list of planned downtimes.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', (req, res) => {
    const data = loadPlannedDowntime();
    res.json(data);
});

/**
 * @swagger
 * /planneddowntime/{id}:
 *   get:
 *     summary: Get a specific planned downtime
 *     tags: [Planned Downtime]
 *     description: Retrieve a single planned downtime by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The planned downtime ID.
 *     responses:
 *       200:
 *         description: A specific planned downtime object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Planned downtime not found.
 */
router.get('/:id', (req, res) => {
    const data = loadPlannedDowntime();
    const id = req.params.id;
    const downtime = data.find(d => d.ID === id);
    if (downtime) {
        res.json(downtime);
    } else {
        res.status(404).json({ message: 'Planned downtime not found' });
    }
});

/**
 * @swagger
 * /planneddowntime:
 *   post:
 *     summary: Add a new planned downtime
 *     tags: [Planned Downtime]
 *     description: Create a new planned downtime.
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
 *         description: Planned downtime added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post('/', (req, res) => {
    const data = loadPlannedDowntime();
    const newData = req.body;
    data.push(newData);
    savePlannedDowntime(data);
    res.status(201).json({ message: 'Planned downtime added successfully' });
});

/**
 * @swagger
 * /planneddowntime/{id}:
 *   put:
 *     summary: Update an existing planned downtime
 *     tags: [Planned Downtime]
 *     description: Update the details of an existing planned downtime.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The planned downtime ID.
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
 *         description: Planned downtime updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Planned downtime not found.
 */
router.put('/:id', (req, res) => {
    const data = loadPlannedDowntime();
    const id = req.params.id;
    const updatedData = req.body;
    const index = data.findIndex(item => item.ID === id);
    if (index !== -1) {
        data[index] = updatedData;
        savePlannedDowntime(data);
        res.status(200).json({ message: 'Planned downtime updated successfully' });
    } else {
        res.status(404).json({ message: 'Planned downtime not found' });
    }
});

/**
 * @swagger
 * /planneddowntime/{id}:
 *   delete:
 *     summary: Delete a planned downtime
 *     tags: [Planned Downtime]
 *     description: Remove a planned downtime from the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The planned downtime ID.
 *     responses:
 *       200:
 *         description: Planned downtime deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Planned downtime not found.
 */
router.delete('/:id', (req, res) => {
    let data = loadPlannedDowntime();
    const initialLength = data.length;
    data = data.filter(item => item.ID !== req.params.id);
    if (data.length !== initialLength) {
        savePlannedDowntime(data);
        res.status(200).json({ message: 'Planned downtime deleted successfully' });
    } else {
        res.status(404).json({ message: 'Planned downtime not found' });
    }
});

module.exports = router;