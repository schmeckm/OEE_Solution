const express = require('express');
const { saveRating } = require('../services/ratingService'); // Import the saveRating function
const { errorLogger } = require('../utils/logger'); // Import logger

const router = express.Router();

// Endpoint to rate a stoppage
router.post('/', (req, res) => {
    const { id, rating } = req.body;
    saveRating(id, rating, (error, updatedStoppages) => {
        if (error) {
            errorLogger.error(`Error in /rate endpoint: ${error.message}`);
            return res.status(500).send(error.message);
        }
        res.json(updatedStoppages);
    });
});

module.exports = router;