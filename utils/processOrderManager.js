const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger');

function loadProcessOrder(filePath) {
    try {
        const data = fs.readFileSync(path.resolve(filePath), 'utf8');
        const processOrder = JSON.parse(data);
        oeeLogger.info(`Process order data loaded from ${filePath}`);
        return processOrder;
    } catch (error) {
        errorLogger.error(`Error loading process order from ${filePath}: ${error.message}`);
        throw error;
    }
}

module.exports = { loadProcessOrder };