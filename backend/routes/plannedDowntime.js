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
    const data = loadPlannedDowntime(); // Load all planned downtimes from the service
    res.json(data); // Return the list of planned downtimes as a JSON response
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
    const data = loadPlannedDowntime(); // Load all planned downtimes from the service
    const id = req.params.id; // Get the ID from the request parameters
    const downtime = data.find(d => d.ID === id); // Find the downtime with the given ID
    if (downtime) {
        res.json(downtime); // Return the found downtime as a JSON response
    } else {
        res.status(404).json({ message: 'Planned downtime not found' }); // Return a 404 error if not found
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
    const data = loadPlannedDowntime(); // Load all planned downtimes from the service
    const newData = req.body; // Get the new downtime data from the request body
    data.push(newData); // Add the new downtime to the list
    savePlannedDowntime(data); // Save the updated list back to the service
    res.status(201).json({ message: 'Planned downtime added successfully' }); // Return a success message
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
    const data = loadPlannedDowntime(); // Load all planned downtimes from the service
    const id = req.params.id; // Get the ID from the request parameters
    const updatedData = req.body; // Get the updated downtime data from the request body
    const index = data.findIndex(item => item.ID === id); // Find the index of the downtime to update
    if (index !== -1) {
        data[index] = updatedData; // Update the downtime data at the found index
        savePlannedDowntime(data); // Save the updated list back to the service
        res.status(200).json({ message: 'Planned downtime updated successfully' }); // Return a success message
    } else {
        res.status(404).json({ message: 'Planned downtime not found' }); // Return a 404 error if not found
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
    let data = loadPlannedDowntime(); // Load all planned downtimes from the service
    const initialLength = data.length; // Store the initial length of the data
    data = data.filter(item => item.ID !== req.params.id); // Filter out the downtime with the given ID
    if (data.length !== initialLength) {
        savePlannedDowntime(data); // Save the updated list back to the service
        res.status(200).json({ message: 'Planned downtime deleted successfully' }); // Return a success message
    } else {
        res.status(404).json({ message: 'Planned downtime not found' }); // Return a 404 error if not found
    }
});

module.exports = router;