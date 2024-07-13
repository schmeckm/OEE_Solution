const fs = require('fs');
const { errorLogger } = require('./logger');

const cache = {};

async function loadJsonData(filePath) {
    if (cache[filePath]) {
        return cache[filePath];
    }
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        cache[filePath] = jsonData;
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

module.exports = { loadJsonData };