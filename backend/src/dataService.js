// dataService.js
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { oeeLogger, errorLogger } = require('../utils/logger');

function loadJsonData(filePath, dateFields = []) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);

        if (dateFields.length > 0) {
            jsonData.forEach(item => {
                dateFields.forEach(field => {
                    if (item[field]) {
                        item[field] = moment.tz(item[field], 'UTC').tz('Europe/Berlin').format('YYYY-MM-DDTHH:mm:ss.SSSZ');
                    }
                });
            });
        }

        oeeLogger.info(`Content of ${filePath} loaded and converted successfully`);
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

module.exports = {
    loadJsonData,
};