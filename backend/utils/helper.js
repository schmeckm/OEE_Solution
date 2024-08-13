const fs = require('fs');
const { errorLogger } = require('./logger');

const cache = {};

/**
 * Loads JSON data from a file path.
 * 
 * @param {string} filePath - The path to the JSON file.
 * @returns {Promise<Object>} - A promise that resolves to the parsed JSON data.
 * @throws {Error} - If there is an error loading or parsing the JSON data.
 */
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