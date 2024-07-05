const express = require('express');
const { calculateOEE } = require('../utils/oeeCalculator');
const { validateOEEData } = require('../utils/middleware');

const router = express.Router();

router.post('/', validateOEEData, (req, res) => {
    try {
        const data = req.body;
        const result = calculateOEE(data);
        res.json(result);
    } catch (error) {
        console.error('Error calculating OEE:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

module.exports = router;