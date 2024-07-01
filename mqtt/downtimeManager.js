const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Import axios for HTTP requests

// Load planned downtime from a JSON file
function loadPlannedDowntime() {
    const jsonFilePath = path.resolve(__dirname, 'plannedDowntime.json');
    try {
        const data = fs.readFileSync(jsonFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error loading planned downtime from JSON file: ${error.message}`);
        return [];
    }
}

// Fetch planned downtime from a REST API if apiUrl is provided
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
    const apiUrl = process.env.PLANNED_DOWNTIME_API_URL;

    if (apiUrl !== null && apiUrl !== 'null') {
        return await fetchPlannedDowntimeFromAPI(apiUrl);
    } else {
        return loadPlannedDowntime();
    }
}

// Calculate the total planned downtime for the current time within the process order period and matching line code
function calculateTotalPlannedDowntime(plannedDowntime, processOrderStart, processOrderEnd, processOrderLineCode) {
    const now = new Date();
    const orderStart = new Date(processOrderStart);
    const orderEnd = new Date(processOrderEnd);

    const totalMinutes = plannedDowntime.reduce((total, downtime) => {
        const start = new Date(downtime.start);
        const end = new Date(downtime.end);

        // Check if the downtime is within the process order period and matches the line code
        if (start >= orderStart && end <= orderEnd && downtime.LineCode === processOrderLineCode && now >= start && now <= end) {
            const downtimeMinutes = (end - start) / (1000 * 60); // Convert milliseconds to minutes
            console.log(`Planned downtime from ${start} to ${end}: ${downtimeMinutes} minutes`);
            return total + downtimeMinutes;
        }
        return total;
    }, 0);

    console.log(`Total planned downtime in minutes: ${totalMinutes}`);
    return totalMinutes;
}

module.exports = {
    loadPlannedDowntime,
    getPlannedDowntime,
    calculateTotalPlannedDowntime
};