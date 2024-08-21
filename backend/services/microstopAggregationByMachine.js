const path = require('path');
const fs = require('fs').promises;

// Helper function to load JSON data from a file
const loadJsonFile = async(filePath) => {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
};

/**
 * Aggregates microstop data for a specific machine, optionally filtered by a date range.
 * 
 * @param {string} machineId - The ID of the machine.
 * @param {Date|null} startDate - The start date for filtering, or null to ignore start date.
 * @param {Date|null} endDate - The end date for filtering, or null to ignore end date.
 * @returns {Object} An object where the keys are reasons and the values are the aggregated differenz values, sorted by differenz in descending order.
 */
const aggregateMicrostopsByMachine = async(machineId, startDate = null, endDate = null) => {
    const microstopsFilePath = path.resolve(__dirname, '../data/microstops.json');
    const machinesFilePath = path.resolve(__dirname, '../data/machine.json');

    const microstops = await loadJsonFile(microstopsFilePath);
    const machines = await loadJsonFile(machinesFilePath);

    // Check if the machine exists
    const machineExists = machines.some(machine => machine.machine_id === machineId);
    if (!machineExists) {
        throw new Error(`Machine with ID ${machineId} not found`);
    }

    // Filter microstops by machine_id and optionally by date range
    const filteredMicrostops = microstops.filter(ms => {
        if (ms.machine_id !== machineId) {
            return false;
        }
        if (startDate && new Date(ms.Start) < startDate) {
            return false;
        }
        if (endDate && new Date(ms.End) > endDate) {
            return false;
        }
        return true;
    });

    // Aggregate by Reason and sum up Differenz values
    const aggregatedData = filteredMicrostops.reduce((acc, curr) => {
        acc[curr.Reason] = (acc[curr.Reason] || 0) + curr.Differenz;
        return acc;
    }, {});

    // Sort by the aggregated Differenz in descending order
    const sortedAggregatedData = Object.entries(aggregatedData)
        .sort(([, a], [, b]) => b - a)
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});

    return sortedAggregatedData;
};

module.exports = { aggregateMicrostopsByMachine };