const express = require('express');
const { saveRating, loadStoppages, saveStoppages } = require('../services/ratingService'); // Import necessary functions
const { errorLogger } = require('../utils/logger'); // Import logger

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Stoppages
 *   description: API for managing stoppages
 */

/**
 * @swagger
 * /stoppages:
 *   get:
 *     summary: Get all stoppages
 *     tags: [Stoppages]
 *     description: Retrieve a list of all stoppages.
 *     responses:
 *       200:
 *         description: A list of stoppages.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', (req, res) => {
    try {
        const stoppages = loadStoppages(); // Load all stoppages
        res.json(stoppages); // Send them as a response
    } catch (error) {
        errorLogger.error(`Error in /stoppages endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /stoppages/{id}:
 *   get:
 *     summary: Get a specific stoppage
 *     tags: [Stoppages]
 *     description: Retrieve a single stoppage by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The stoppage ID.
 *     responses:
 *       200:
 *         description: A stoppage object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Stoppage not found.
 */
router.get('/:id', (req, res) => {
    try {
        const stoppages = loadStoppages(); // Load all stoppages
        const stoppage = stoppages.find(s => s.id === req.params.id); // Find the stoppage by ID
        if (stoppage) {
            res.json(stoppage); // Send the stoppage as a response
        } else {
            res.status(404).json({ message: 'Stoppage not found' });
        }
    } catch (error) {
        errorLogger.error(`Error in /stoppages/${req.params.id} get endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /stoppages:
 *   post:
 *     summary: Create a new stoppage
 *     tags: [Stoppages]
 *     description: Create a new stoppage and save it to the list.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               description:
 *                 type: string
 *               duration:
 *                 type: number
 *                 description: The duration of the stoppage in minutes.
 *     responses:
 *       201:
 *         description: Stoppage created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 stoppage:
 *                   type: object
 */
router.post('/', (req, res) => {
    try {
        const stoppages = loadStoppages(); // Load current stoppages
        const newStoppage = req.body; // Get the new stoppage data from request body
        stoppages.push(newStoppage); // Add the new stoppage to the list
        saveStoppages(stoppages); // Save the updated list of stoppages
        res.status(201).json({ message: 'Stoppage created successfully', stoppage: newStoppage });
    } catch (error) {
        errorLogger.error(`Error in /stoppages post endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /stoppages/{id}:
 *   put:
 *     summary: Update an existing stoppage
 *     tags: [Stoppages]
 *     description: Update the details of an existing stoppage.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The stoppage ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               duration:
 *                 type: number
 *                 description: The duration of the stoppage in minutes.
 *     responses:
 *       200:
 *         description: Stoppage updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 stoppage:
 *                   type: object
 *       404:
 *         description: Stoppage not found.
 */
router.put('/:id', (req, res) => {
    try {
        const stoppages = loadStoppages(); // Load current stoppages
        const index = stoppages.findIndex(s => s.id === req.params.id); // Find the stoppage by ID
        if (index !== -1) {
            stoppages[index] = {...stoppages[index], ...req.body }; // Update stoppage data
            saveStoppages(stoppages); // Save the updated list of stoppages
            res.json({ message: 'Stoppage updated successfully', stoppage: stoppages[index] });
        } else {
            res.status(404).json({ message: 'Stoppage not found' });
        }
    } catch (error) {
        errorLogger.error(`Error in /stoppages/${req.params.id} put endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /stoppages/{id}:
 *   delete:
 *     summary: Delete a stoppage
 *     tags: [Stoppages]
 *     description: Delete a specific stoppage by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the stoppage to delete.
 *     responses:
 *       200:
 *         description: Stoppage deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 stoppages:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Stoppage not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', (req, res) => {
    try {
        let stoppages = loadStoppages(); // Load current stoppages
        const initialLength = stoppages.length;
        stoppages = stoppages.filter(s => s.id !== req.params.id); // Filter out the stoppage to delete

        if (stoppages.length === initialLength) {
            return res.status(404).json({ message: 'Stoppage not found' });
        }

        saveStoppages(stoppages); // Save the updated stoppages
        res.json({ message: 'Stoppage deleted successfully', stoppages });
    } catch (error) {
        errorLogger.error(`Error in /stoppages/${req.params.id} delete endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

module.exports = router;