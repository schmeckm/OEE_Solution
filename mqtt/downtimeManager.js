const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { api } = require('../config/config');

// Load planned downtime from a JSON file
function loadPlannedDowntime(jsonFilePath) {
    const fullPath = path.resolve(jsonFilePath);
    const data = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(data);
}

// Fetch planned downtime from a REST API
async function fetchPlannedDowntimeFromAPI(apiUrl) {
    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching planned downtime from API: ${error.message}`);
        return [];
    }
}

// Get planned downtime from API or JSON file based on config
async function getPlannedDowntime() {
    if (api.plannedDowntimeUrl) {
        return await fetchPlannedDowntimeFromAPI(api.plannedDowntimeUrl);
    } else {
        return loadPlannedDowntime('./plannedDowntime.json');
    }
}

// Calculate the total planned downtime for the current time within the process order period and matching line code
function calculateTotalPlannedDowntime(plannedDowntime, processOrderStart, processOrderEnd, processOrderLineCode) {
    const now = new Date();
    const orderStart = new Date(processOrderStart);
    const orderEnd = new Date(processOrderEnd);

    return plannedDowntime.reduce((total, downtime) => {
        const start = new Date(downtime.start);
        const end = new Date(downtime.end);

        // Check if the downtime is within the process order period and matches the line code
        if (start >= orderStart && end <= orderEnd && downtime.LineCode === processOrderLineCode && now >= start && now <= end) {
            return total + (end - start) / (1000 * 60); // Convert milliseconds to minutes
        }
        return total;
    }, 0);
}

module.exports = {
    loadPlannedDowntime,
    getPlannedDowntime,
    calculateTotalPlannedDowntime
};