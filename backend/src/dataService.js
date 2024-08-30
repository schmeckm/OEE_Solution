const fs = require("fs").promises;
const { errorLogger } = require("../utils/logger");

/**
 * Loads and parses JSON data from a file asynchronously.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Promise<any>} A promise that resolves to the parsed JSON data.
 */
async function loadJsonData(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    errorLogger.error(
      `Failed to load JSON data from ${filePath}: ${error.message}`
    );
    throw error;
  }
}

module.exports = {
  loadJsonData,
};
