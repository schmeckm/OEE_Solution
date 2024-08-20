const express = require('express');
const { calculateOEE } = require('../src/oeeCalculator');
const { validateOEEData } = require('../utils/middleware');
const { oeeLogger, errorLogger } = require('../utils/logger');

const router = express.Router();

/**
 * Route to calculate OEE (Overall Equipment Effectiveness).
 * It validates the incoming data and then calculates the OEE based on the validated data.
 * 
 * @route POST /calculateOEE
 * @param {express.Request} req - Express request object containing OEE data in the body.
 * @param {express.Response} res - Express response object to send the calculated OEE result.
 * @returns {Object} JSON response containing the calculated OEE result.
 * @throws {Error} If an error occurs during OEE calculation, a 500 status code is returned.
 */
router.post('/', validateOEEData, (req, res) => {
    try {
        const data = req.body; // Extract data from request body
        const result = calculateOEE(data); // Calculate OEE using the provided data
        res.json(result); // Send the result as a JSON response
    } catch (error) {
        oeeLogger.error('Error calculating OEE:', error); // Log the error for debugging
        res.status(500).json({ message: 'Internal server error', error }); // Send an error response
    }
});

module.exports = router;