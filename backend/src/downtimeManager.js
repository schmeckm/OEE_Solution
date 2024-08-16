const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { oeeLogger, errorLogger } = require('../utils/logger');

// File paths for JSON data
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');
const microstopFilePath = path.resolve(__dirname, '../data/microstops.json');

// Cache variables
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let microstopCache = null;

// Load JSON data from a file with caching and validation
function loadJsonData(filePath) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);

        if (!Array.isArray(jsonData)) {
            oeeLogger.warn(`Data in ${filePath} is not an array.`);
            return []; // Return an empty array if the data is not in the expected format
        }

        oeeLogger.info(`Content of ${filePath} loaded successfully`);
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

// Load and cache microstop data
function loadMicrostopData() {
    if (!microstopCache) {
        try {
            microstopCache = loadJsonData(microstopFilePath);
            if (!Array.isArray(microstopCache)) {
                oeeLogger.warn(`Expected an array in microstop.json but received: ${typeof microstopCache}`);
                microstopCache = [];
            } else if (microstopCache.length === 0) {
                oeeLogger.warn(`Microstop array is empty in ${microstopFilePath}`);
            } else {
                oeeLogger.info(`Microstop data successfully loaded: ${JSON.stringify(microstopCache, null, 2)}`);
            }
        } catch (error) {
            errorLogger.error(`Error reading or processing microstop.json: ${error.message}`);
            throw error;
        }
    }
    return microstopCache;
}

// Load and cache unplanned downtime data
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
        if (!Array.isArray(unplannedDowntimeCache)) {
            oeeLogger.warn(`Expected an array in unplannedDowntime.json but received: ${typeof unplannedDowntimeCache}`);
            unplannedDowntimeCache = [];
        } else if (unplannedDowntimeCache.length === 0) {
            oeeLogger.warn(`Unplanned downtime array is empty in ${unplannedDowntimeFilePath}`);
        } else {
            oeeLogger.info(`Unplanned downtime data successfully loaded: ${JSON.stringify(unplannedDowntimeCache, null, 2)}`);
        }
    }
    return unplannedDowntimeCache;
}

// Load and cache planned downtime data
function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
        if (!Array.isArray(plannedDowntimeCache)) {
            oeeLogger.warn(`Expected an array in plannedDowntime.json but received: ${typeof plannedDowntimeCache}`);
            plannedDowntimeCache = [];
        } else if (plannedDowntimeCache.length === 0) {
            oeeLogger.warn(`Planned downtime array is empty in ${plannedDowntimeFilePath}`);
        } else {
            oeeLogger.info(`Planned downtime data successfully loaded: ${JSON.stringify(plannedDowntimeCache, null, 2)}`);
        }
    }
    return plannedDowntimeCache;
}

// Load and cache process order data
function loadProcessOrderData() {
    if (!processOrderDataCache) {
        processOrderDataCache = loadJsonData(processOrderFilePath);
        oeeLogger.info(`Process order data loaded from ${processOrderFilePath}`);
    }
    if (!Array.isArray(processOrderDataCache)) {
        throw new Error("Expected an array from process order data");
    }
    return processOrderDataCache;
}

// Load and cache shift model data
function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath);
        oeeLogger.info(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

// Parse a date string to a Moment object in UTC
function parseDate(dateStr) {
    return moment.utc(dateStr);
}

// Get microstops filtered by machine ID
function getMicrostops(machineId) {
    try {
        const microstopEntries = loadMicrostopData();

        const filteredEntries = microstopEntries.filter(entry => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return false;
            }

            const isMatchingMachine = entry.machine_id === machineId;

            if (isMatchingMachine) {
                oeeLogger.debug(`Microstop for machineId ${machineId}: Start: ${entry.Start}, End: ${entry.End}`);
            }

            return isMatchingMachine;
        });

        return filteredEntries;

    } catch (error) {
        errorLogger.error(`Error reading or processing microstop.json: ${error.message}`);
        throw error;
    }
}

// Get planned downtime filtered by machine ID and time range
function getPlannedDowntime(machineId) {
    try {
        const plannedDowntimeEntries = loadPlannedDowntimeData();

        const filteredEntries = plannedDowntimeEntries.filter(entry => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return false;
            }

            const isMatchingMachine = entry.machine_id === machineId;

            if (isMatchingMachine) {
                oeeLogger.debug(`Planned Downtime for machineId ${machineId}: Start: ${entry.Start}, End: ${entry.End}`);
            }

            return isMatchingMachine;
        });

        return filteredEntries;

    } catch (error) {
        errorLogger.error(`Error reading or processing plannedDowntime.json: ${error.message}`);
        throw error;
    }
}

// Get unplanned downtime filtered by machine ID and time range
function getUnplannedDowntime(machineId) {
    try {
        const unplannedDowntimeEntries = loadUnplannedDowntimeData();

        const filteredEntries = unplannedDowntimeEntries.filter(entry => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return false;
            }

            const isMatchingMachine = entry.machine_id === machineId;

            if (isMatchingMachine) {
                oeeLogger.debug(`Unplanned Downtime for machineId ${machineId}: Start: ${entry.Start}, End: ${entry.End}`);
            }

            return isMatchingMachine;
        });

        return filteredEntries;

    } catch (error) {
        errorLogger.error(`Error reading or processing unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

// Function to calculate break duration
function calculateBreakDuration(breakStart, breakEnd) {
    const breakStartTime = moment(breakStart, "HH:mm");
    const breakEndTime = moment(breakEnd, "HH:mm");
    return breakEndTime.diff(breakStartTime, 'minutes');
}

// Function to filter and calculate durations for OEE calculation
function filterAndCalculateDurations(processOrder, plannedDowntime, unplannedDowntime, microstops, shifts) {
    const orderStart = parseDate(processOrder.Start).startOf('hour');
    const orderEnd = parseDate(processOrder.End).endOf('hour');

    oeeLogger.debug(`Order Start: ${orderStart.format()}, Order End: ${orderEnd.format()}`);

    // Filter planned downtime entries
    const filteredPlannedDowntime = plannedDowntime.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        const isInRange = start.isBetween(orderStart, orderEnd, null, '[]') || end.isBetween(orderStart, orderEnd, null, '[]');
        oeeLogger.debug(`Planned Downtime: Start: ${start.format()}, End: ${end.format()}, In Range: ${isInRange}`);
        return isInRange;
    });

    // Filter unplanned downtime entries
    const filteredUnplannedDowntime = unplannedDowntime.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        const isInRange = start.isBetween(orderStart, orderEnd, null, '[]') || end.isBetween(orderStart, orderEnd, null, '[]');
        oeeLogger.debug(`Unplanned Downtime: Start: ${start.format()}, End: ${end.format()}, In Range: ${isInRange}`);
        return isInRange;
    });

    // Filter microstops
    const filteredMicrostops = microstops.filter(microstop => {
        const start = parseDate(microstop.Start);
        const end = parseDate(microstop.End);
        const isInRange = start.isBetween(orderStart, orderEnd, null, '[]') || end.isBetween(orderStart, orderEnd, null, '[]');
        oeeLogger.debug(`Microstop: Start: ${start.format()}, End: ${end.format()}, In Range: ${isInRange}`);
        return isInRange;
    });

    // Filter breaks
    const filteredBreaks = shifts.flatMap(shift => {
        const shiftStart = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.shift_start_time}`, "YYYY-MM-DD HH:mm");
        const shiftEnd = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.shift_end_time}`, "YYYY-MM-DD HH:mm");
        const breakStart = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.break_start}`, "YYYY-MM-DD HH:mm");
        const breakEnd = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.break_end}`, "YYYY-MM-DD HH:mm");

        if (breakEnd.isBefore(breakStart)) {
            breakEnd.add(1, 'day');
        }
        if (shiftEnd.isBefore(shiftStart)) {
            shiftEnd.add(1, 'day');
        }

        oeeLogger.debug(`Shift ID: ${shift.shift_id}, Break Start: ${breakStart.format()}, Break End: ${breakEnd.format()}`);

        if (shift.machine_id === processOrder.machine_id) {
            return [{
                breakDuration: calculateBreakDuration(shift.break_start, shift.break_end),
                breakStart: breakStart.format(),
                breakEnd: breakEnd.format()
            }];
        }
        return [];
    });

    return {
        plannedDowntime: filteredPlannedDowntime,
        unplannedDowntime: filteredUnplannedDowntime,
        microstops: filteredMicrostops,
        breaks: filteredBreaks
    };
}

// Main function to load data and prepare OEE calculations
function loadDataAndPrepareOEE(machineId) {
    oeeLogger.debug(`Inside loadDataAndPrepareOEE with machineId: ${machineId}`);

    if (!machineId) {
        throw new Error('MachineId is required to load and prepare OEE data.');
    }

    try {
        oeeLogger.info('Loading data and preparing OEE data.');

        // Load and filter process orders by machineId and status 'REL'
        const processOrders = loadProcessOrderData().filter(order => {
            if (order.machine_id === machineId && order.ProcessOrderStatus === 'REL') {
                oeeLogger.info(`Matching process order found: ${JSON.stringify(order)}`);
                return true;
            }
            return false;
        });

        if (processOrders.length === 0) {
            throw new Error(`No running process orders found for machineId: ${machineId}`);
        }

        const currentProcessOrder = processOrders[0];
        const processOrderStartTime = currentProcessOrder.Start;
        const processOrderEndTime = currentProcessOrder.End;

        oeeLogger.debug(`Current process order details: ${JSON.stringify(currentProcessOrder, null, 2)}`);

        // Load planned, unplanned downtimes and microstops based on machineId and process order start/end times
        const plannedDowntime = getPlannedDowntime(machineId, processOrderStartTime, processOrderEndTime);
        const unplannedDowntime = getUnplannedDowntime(machineId, processOrderStartTime, processOrderEndTime);
        const microstops = getMicrostops(machineId, processOrderStartTime, processOrderEndTime);

        const shifts = loadShiftModelData().filter(shift => shift.machine_id === machineId);

        oeeLogger.debug(`Filtered shifts: ${JSON.stringify(shifts, null, 2)}`);

        const durations = filterAndCalculateDurations(currentProcessOrder, plannedDowntime, unplannedDowntime, microstops, shifts);
        oeeLogger.debug(`Filtered durations: ${JSON.stringify(durations, null, 2)}`);

        const OEEData = {
            labels: [],
            datasets: [
                { label: 'Production', data: [], backgroundColor: 'green' },
                { label: 'Break', data: [], backgroundColor: 'blue' },
                { label: 'Unplanned Downtime', data: [], backgroundColor: 'red' },
                { label: 'Planned Downtime', data: [], backgroundColor: 'orange' },
                { label: 'Microstops', data: [], backgroundColor: 'purple' }
            ]
        };

        let currentTime = parseDate(currentProcessOrder.Start).startOf('hour');
        const orderEnd = parseDate(currentProcessOrder.End).endOf('hour');

        oeeLogger.debug(`Rounded order start time: ${currentTime.format()}`);
        oeeLogger.debug(`Rounded order end time: ${orderEnd.format()}`);

        // Populate OEE data for each hour in the process order time range
        while (currentTime.isBefore(orderEnd)) {
            const nextTime = currentTime.clone().add(1, 'hour');

            if (OEEData.labels.includes(currentTime.toISOString())) {
                oeeLogger.warn(`Duplicate interval detected: ${currentTime.toISOString()} - Skipping this interval.`);
                currentTime = nextTime;
                continue;
            }

            OEEData.labels.push(currentTime.toISOString());

            let productionTime = nextTime.diff(currentTime, 'minutes');
            let breakTime = 0;
            let unplannedDowntime = 0;
            let plannedDowntime = 0;
            let microstopTime = 0;

            durations.breaks.forEach(breakInfo => {
                const breakStart = moment(breakInfo.breakStart);
                const breakEnd = moment(breakInfo.breakEnd);

                if (currentTime.isBefore(breakEnd) && nextTime.isAfter(breakStart)) {
                    const overlapStart = moment.max(currentTime, breakStart);
                    const overlapEnd = moment.min(nextTime, breakEnd);
                    breakTime += overlapEnd.diff(overlapStart, 'minutes');
                }
            });

            durations.unplannedDowntime.forEach(downtime => {
                const downtimeStart = parseDate(downtime.Start);
                const downtimeEnd = parseDate(downtime.End);
                if (currentTime.isBefore(downtimeEnd) && nextTime.isAfter(downtimeStart)) {
                    const overlapStart = moment.max(currentTime, downtimeStart);
                    const overlapEnd = moment.min(nextTime, downtimeEnd);
                    unplannedDowntime += overlapEnd.diff(overlapStart, 'minutes');
                }
            });

            durations.plannedDowntime.forEach(downtime => {
                const downtimeStart = parseDate(downtime.Start);
                const downtimeEnd = parseDate(downtime.End);
                if (currentTime.isBefore(downtimeEnd) && nextTime.isAfter(downtimeStart)) {
                    const overlapStart = moment.max(currentTime, downtimeStart);
                    const overlapEnd = moment.min(nextTime, downtimeEnd);
                    plannedDowntime += overlapEnd.diff(overlapStart, 'minutes');
                }
            });

            durations.microstops.forEach(microstop => {
                const microstopStart = parseDate(microstop.Start);
                const microstopEnd = parseDate(microstop.End);
                if (currentTime.isBefore(microstopEnd) && nextTime.isAfter(microstopStart)) {
                    const overlapStart = moment.max(currentTime, microstopStart);
                    const overlapEnd = moment.min(nextTime, microstopEnd);
                    microstopTime += overlapEnd.diff(overlapStart, 'minutes');
                }
            });

            // Ensure production time does not go negative
            const totalNonProductionTime = breakTime + unplannedDowntime + plannedDowntime + microstopTime;
            productionTime = Math.max(0, productionTime - totalNonProductionTime);

            oeeLogger.debug(`Interval ${currentTime.format("HH:mm")} - ${nextTime.format("HH:mm")}:`);
            oeeLogger.debug(`  Production time: ${productionTime} minutes`);
            oeeLogger.debug(`  Break time: ${breakTime} minutes`);
            oeeLogger.debug(`  Unplanned downtime: ${unplannedDowntime} minutes`);
            oeeLogger.debug(`  Planned downtime: ${plannedDowntime} minutes`);
            oeeLogger.debug(`  Microstop time: ${microstopTime} minutes`);

            // Correctly assign the calculated values to their respective datasets
            OEEData.datasets[0].data.push(productionTime); // Production time
            OEEData.datasets[1].data.push(breakTime); // Break time
            OEEData.datasets[2].data.push(unplannedDowntime); // Unplanned Downtime
            OEEData.datasets[3].data.push(plannedDowntime); // Planned Downtime
            OEEData.datasets[4].data.push(microstopTime); // Microstop time

            // Move to the next hour
            currentTime = nextTime;
        }


        oeeLogger.info('OEE data prepared successfully.');
        oeeLogger.info(`OEE Data: ${JSON.stringify(OEEData)}`);

        return OEEData;
    } catch (error) {
        errorLogger.error(`Error loading or preparing OEE data: ${error.message}`);
        throw error;
    }
}

// Export the functions for use in other modules
module.exports = {
    getUnplannedDowntime,
    getPlannedDowntime,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadShiftModelData,
    loadDataAndPrepareOEE,
    getMicrostops
};