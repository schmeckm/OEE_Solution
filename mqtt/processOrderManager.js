const fs = require('fs');
const path = require('path');

// Load process order from a JSON file
function loadProcessOrder(jsonFilePath) {
    const fullPath = path.resolve(jsonFilePath);
    const data = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(data);
}

module.exports = {
    loadProcessOrder
};