const express = require('express');
const router = express.Router();
const { aggregateMicrostopsByMachine } = require('../services/microstopAggregationByMachine');
const { defaultLogger, errorLogger } = require('../utils/logger');

/**
 * @swagger
 * /microstops/aggregation/{machine_id}:
 *   get:
 *     summary: Get aggregated microstop data by machine ID, optionally filtered by date range
 *     tags: [Microstops]
 *     parameters:
 *       - in: path
 *         name: machine_id
 *         required: true
 *         description: The ID of the machine to filter the microstops by.
 *         schema:
 *           type: string
 *       - in: query
 *         name: start
 *         required: false
 *         description: The start date for filtering the microstops.
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: end
 *         required: false
 *         description: The end date for filtering the microstops.
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Aggregated microstop data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: integer
 *       404:
 *         description: Machine ID not found
 *       500:
 *         description: Internal server error
 */
router.get('/microstops/aggregation/:machine_id', async(req, res) => {
    const machineId = req.params.machine_id;
    const startDate = req.query.start ? new Date(req.query.start) : null;
    const endDate = req.query.end ? new Date(req.query.end) : null;

    defaultLogger.info('Aggregating microstop data', { machineId, startDate, endDate });

    try {
        if (!machineId) {
            errorLogger.warn('No machine_id provided');
            return res.status(400).json({ message: 'Machine ID is required' });
        }

        const result = await aggregateMicrostopsByMachine(machineId, startDate, endDate);

        if (Object.keys(result).length === 0) {
            errorLogger.warn('No data found for the given machine ID and date range', { machineId, startDate, endDate });
            return res.status(404).json({ message: 'Machine ID not found' });
        }

        defaultLogger.info('Successfully aggregated microstop data', { result });
        res.json(result);
    } catch (error) {
        errorLogger.error('Error aggregating microstop data', { error });
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;