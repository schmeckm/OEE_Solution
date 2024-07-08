const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger'); // Ensure the logger is correctly imported

// Cache variable for process order data
let processOrderCache = null;

/**
 * Load process order data from the JSON file, using cache if available.
 * This ensures that the data is only loaded once and reused.
 * @returns {Object} The process order data.
 */
function loadProcessOrder() {
    if (processOrderCache) {
        // Return the cached data if already loaded
        return processOrderCache;
    }

    const filePath = path.join(__dirname, '../data/processorder.json'); // Path to the JSON file
    try {
        // Read the JSON file and parse its content
        const data = fs.readFileSync(filePath, 'utf8');
        processOrderCache = JSON.parse(data); // Cache the data
        oeeLogger.info(`Process order data loaded from ${filePath}`);
        return processOrderCache;
    } catch (error) {
        // Log an error if reading or parsing the file fails
        errorLogger.error(`Error loading process order from ${filePath}: ${error.message}`);
        throw error;
    }
}

module.exports = { loadProcessOrder };