const express = require('express');
const { loadEnvConfig, saveEnvConfig } = require('../services/settingsService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Environment Configuration
 *   description: API for managing environment configuration settings
 */

/**
 * @swagger
 * /settings/env:
 *   get:
 *     summary: Get the entire environment configuration
 *     tags: [Environment Configuration]
 *     description: Retrieve all the settings from the `.env` file.
 *     responses:
 *       200:
 *         description: A list of all environment settings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/env', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        res.json(envConfig);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /settings/env:
 *   put:
 *     summary: Update the entire environment configuration
 *     tags: [Environment Configuration]
 *     description: Update all settings in the `.env` file.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The updated configuration values.
 *     responses:
 *       200:
 *         description: Environment configuration updated successfully.
 *       500:
 *         description: Internal server error.
 */
router.put('/env', (req, res) => {
    try {
        const newEnvConfig = req.body;
        saveEnvConfig(newEnvConfig);
        res.status(200).json({ message: 'Environment configuration updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /settings/env/{key}:
 *   get:
 *     summary: Get a specific environment setting
 *     tags: [Environment Configuration]
 *     description: Retrieve the value of a specific key from the `.env` file.
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The environment key to retrieve.
 *     responses:
 *       200:
 *         description: The value of the specified environment key.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *       404:
 *         description: Key not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/env/:key', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const key = req.params.key;
        if (envConfig[key] !== undefined) {
            res.json({
                [key]: envConfig[key]
            });
        } else {
            res.status(404).json({ message: `Key ${key} not found` });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /settings/env/{key}:
 *   put:
 *     summary: Update a specific environment setting
 *     tags: [Environment Configuration]
 *     description: Update the value of a specific key in the `.env` file.
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The environment key to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Key updated successfully.
 *       404:
 *         description: Key not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/env/:key', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const key = req.params.key;
        const value = req.body.value;
        envConfig[key] = value;
        saveEnvConfig(envConfig);
        res.status(200).json({ message: `Key ${key} updated successfully` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /settings/env:
 *   post:
 *     summary: Add a new environment setting
 *     tags: [Environment Configuration]
 *     description: Add a new key-value pair to the `.env` file.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: string
 *     responses:
 *       201:
 *         description: New configuration added successfully.
 *       500:
 *         description: Internal server error.
 */
router.post('/env', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const newConfig = req.body;
        for (let key in newConfig) {
            envConfig[key] = newConfig[key];
        }
        saveEnvConfig(envConfig);
        res.status(201).json({ message: 'New configuration added successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /settings/env/{key}:
 *   delete:
 *     summary: Delete a specific environment setting
 *     tags: [Environment Configuration]
 *     description: Remove a key-value pair from the `.env` file.
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The environment key to delete.
 *     responses:
 *       200:
 *         description: Key deleted successfully.
 *       404:
 *         description: Key not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/env/:key', (req, res) => {
    try {
        const envConfig = loadEnvConfig();
        const key = req.params.key;
        if (envConfig[key] !== undefined) {
            delete envConfig[key];
            saveEnvConfig(envConfig);
            res.status(200).json({ message: `Key ${key} deleted successfully` });
        } else {
            res.status(404).json({ message: `Key ${key} not found` });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;