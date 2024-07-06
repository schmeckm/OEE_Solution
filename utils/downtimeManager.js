const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger } = require('../utils/logger'); // Ensure you import your logger correctly

// Path to the unplannedDowntime.json file
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');

// Function to accumulate downtime difference for the same ProcessOrderNumber
function unplannedDowntime(processOrderNumber) {
    try {
        // Read the content of unplannedDowntime.json file
        const data = fs.readFileSync(unplannedDowntimeFilePath, 'utf8');
        const unplannedDowntimeEntries = JSON.parse(data);

        // Sum the differences for the given ProcessOrderNumber
        const totalDowntimeMinutes = unplannedDowntimeEntries.reduce((total, entry) => {
            if (entry.ProcessOrderNumber === processOrderNumber) {
                total += entry.Differenz;
            }
            return total;
        }, 0);

        // Log the accumulated downtime
        oeeLogger.info(`Total accumulated unplanned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

function getPlannedDowntime() {
    try {
        const data = fs.readFileSync(path.resolve('./data/plannedDowntime.json'), 'utf8');
        const plannedDowntime = JSON.parse(data);
        oeeLogger.info(`Planned downtime data loaded from ./data/plannedDowntime.json`);
        return plannedDowntime;
    } catch (error) {
        errorLogger.error(`Error loading planned downtime from ./data/plannedDowntime.json: ${error.message}`);
        throw error;
    }
}

function calculateTotalPlannedDowntime(plannedDowntime, start, end, lineCode) {
    // Implement logic to calculate planned downtime
    // Example:
    return plannedDowntime.reduce((total, downtime) => {
        if (downtime.lineCode === lineCode && downtime.start >= start && downtime.end <= end) {
            total += downtime.duration;
        }
        return total;
    }, 0);
}

module.exports = { getPlannedDowntime, calculateTotalPlannedDowntime, unplannedDowntime };