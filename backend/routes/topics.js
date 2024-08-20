const express = require('express');
const { generateTopics } = require('../services/topicService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Topics
 *   description: API for generating dynamic topics based on machine and OEE configuration
 */

/**
 * @swagger
 * /topics:
 *   get:
 *     summary: Get dynamic topics
 *     tags: [Topics]
 *     description: Generate topics based on the Plant, Area, or Line.
 *     parameters:
 *       - in: query
 *         name: plant
 *         schema:
 *           type: string
 *         description: Filter by Plant
 *       - in: query
 *         name: area
 *         schema:
 *           type: string
 *         description: Filter by Area
 *       - in: query
 *         name: line
 *         schema:
 *           type: string
 *         description: Filter by Line
 *     responses:
 *       200:
 *         description: A list of generated topics.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 */
router.get('/topics', async(req, res) => {
    try {
        const { plant, area, line } = req.query;
        const topics = await generateTopics(plant, area, line);
        res.json(topics);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;