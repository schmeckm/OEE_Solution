const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { oeeLogger, errorLogger } = require('../utils/logger');

/**
 * Paths to JSON data files used in OEE calculations.
 * @constant
 * @type {string}
 */
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');
const microstopFilePath = path.resolve(__dirname, '../data/microstops.json');

// Cache variables to store loaded data and avoid redundant file reads.
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let microstopCache = null;

/**
 * Invalidates all caches to force reloading data from files.
 */
function invalidateCache() {
    unplannedDowntimeCache = null;
    plannedDowntimeCache = null;
    processOrderDataCache = null;
    shiftModelDataCache = null;
    microstopCache = null;
}

/**
 * Loads and parses JSON data from a specified file with caching.
 * 
 * @param {string} filePath - The path to the JSON file.
 * @returns {Array|Object} - The parsed JSON data.
 * @throws Will throw an error if the file cannot be read or parsed.
 */
function loadJsonData(filePath) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);

        if (!Array.isArray(jsonData)) {
            oeeLogger.warn(`Data in ${filePath} is not an array.`);
            return []; // Return an empty array if the data is not in the expected format
        }

        oeeLogger.debug(`Content of ${filePath} loaded successfully`);
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Loads and caches microstop data from the JSON file.
 * 
 * @returns {Array} - The cached microstop data.
 */
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
                oeeLogger.debug(`Microstop data successfully loaded: ${JSON.stringify(microstopCache, null, 2)}`);
            }
        } catch (error) {
            errorLogger.error(`Error reading or processing microstop.json: ${error.message}`);
            throw error;
        }
    }
    return microstopCache;
}

/**
 * Loads all JSON data files in parallel and caches the data.
 */
async function loadAllData() {
    try {
        const [unplannedDowntime, plannedDowntime, processOrders, shifts, microstops] = await Promise.all([
            loadJsonData(unplannedDowntimeFilePath),
            loadJsonData(plannedDowntimeFilePath),
            loadJsonData(processOrderFilePath),
            loadJsonData(shiftModelFilePath),
            loadJsonData(microstopFilePath)
        ]);

        unplannedDowntimeCache = unplannedDowntime;
        plannedDowntimeCache = plannedDowntime;
        processOrderDataCache = processOrders;
        shiftModelDataCache = shifts;
        microstopCache = microstops;

        oeeLogger.info('All data loaded and cached successfully.');
    } catch (error) {
        errorLogger.error(`Error loading data in parallel: ${error.message}`);
        throw error;
    }
}

/**
 * Loads unplanned downtime data if not already cached.
 * 
 * @returns {Array} - The unplanned downtime data.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
    }
    return unplannedDowntimeCache;
}

/**
 * Loads planned downtime data if not already cached.
 * 
 * @returns {Array} - The planned downtime data.
 */
function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
    }
    return plannedDowntimeCache;
}

/**
 * Loads process order data if not already cached.
 * 
 * @returns {Array} - The process order data.
 */
function loadProcessOrderData() {
    if (!processOrderDataCache) {
        processOrderDataCache = loadJsonData(processOrderFilePath);
    }
    return processOrderDataCache;
}

/**
 * Loads shift model data if not already cached.
 * 
 * @returns {Array} - The shift model data.
 */
function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath);
    }
    return shiftModelDataCache;
}

/**
 * Parses a date string to a Moment object in UTC.
 * 
 * @param {string} dateStr - The date string to parse.
 * @returns {Object} - A Moment object representing the parsed date.
 */
function parseDate(dateStr) {
    return moment.utc(dateStr);
}

/**
 * Filters data by machine ID and time range.
 * 
 * @param {Array} dataArray - The data array to filter.
 * @param {string} machineId - The machine ID to filter by.
 * @param {string} orderStart - The start time of the order.
 * @param {string} orderEnd - The end time of the order.
 * @returns {Array} - The filtered data array.
 */
function filterDataByTimeRange(dataArray, machineId, orderStart, orderEnd) {
    return dataArray.filter(entry => {
        const start = parseDate(entry.Start);
        const end = parseDate(entry.End);
        const isMatchingMachine = entry.machine_id === machineId;
        const isInRange = start.isBetween(orderStart, orderEnd, null, '[]') || end.isBetween(orderStart, orderEnd, null, '[]');
        return isMatchingMachine && isInRange;
    });
}

/**
 * Calculates the overlap duration between two time intervals.
 * 
 * @param {Object} start1 - The start time of the first interval.
 * @param {Object} end1 - The end time of the first interval.
 * @param {Object} start2 - The start time of the second interval.
 * @param {Object} end2 - The end time of the second interval.
 * @returns {number} - The overlap duration in minutes.
 */
function calculateOverlap(start1, end1, start2, end2) {
    const overlapStart = moment.max(start1, start2);
    const overlapEnd = moment.min(end1, end2);
    return Math.max(0, overlapEnd.diff(overlapStart, 'minutes'));
}

/**
 * Gets microstops filtered by machine ID.
 * 
 * @param {string} machineId - The machine ID to filter by.
 * @returns {Array} - The filtered microstops.
 */
function getMicrostops(machineId) {
    return filterDataByTimeRange(loadMicrostopData(), machineId);
}

/**
 * Gets planned downtime filtered by machine ID and time range.
 * 
 * @param {string} machineId - The machine ID to filter by.
 * @returns {Array} - The filtered planned downtime.
 */
function getPlannedDowntime(machineId) {
    return filterDataByTimeRange(loadPlannedDowntimeData(), machineId);
}

/**
 * Gets unplanned downtime filtered by machine ID and time range.
 * 
 * @param {string} machineId - The machine ID to filter by.
 * @returns {Array} - The filtered unplanned downtime.
 */
function getUnplannedDowntime(machineId) {
    return filterDataByTimeRange(loadUnplannedDowntimeData(), machineId);
}

/**
 * Calculates the duration of a break given its start and end time.
 * 
 * @param {string} breakStart - The start time of the break.
 * @param {string} breakEnd - The end time of the break.
 * @returns {number} - The duration of the break in minutes.
 */
function calculateBreakDuration(breakStart, breakEnd) {
    const breakStartTime = moment(breakStart, "HH:mm");
    const breakEndTime = moment(breakEnd, "HH:mm");
    return breakEndTime.diff(breakStartTime, 'minutes');
}

/**
 * Filters and calculates durations for OEE calculation.
 * 
 * @param {Object} processOrder - The process order details.
 * @param {Array} plannedDowntime - The planned downtime data.
 * @param {Array} unplannedDowntime - The unplanned downtime data.
 * @param {Array} microstops - The microstop data.
 * @param {Array} shifts - The shift data.
 * @returns {Object} - The filtered and calculated durations.
 */
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

/**
 * Main function to load data and prepare OEE calculations.
 * 
 * @param {string} machineId - The machine ID for which to prepare OEE data.
 * @returns {Object} - The prepared OEE data.
 * @throws Will throw an error if the machine ID is not provided or if no process orders are found.
 */
function loadDataAndPrepareOEE(machineId) {
    oeeLogger.debug(`Inside loadDataAndPrepareOEE with machineId: ${machineId}`);

    if (!machineId) {
        throw new Error('MachineId is required to load and prepare OEE data.');
    }

    try {
        const processOrders = loadProcessOrderData().filter(order => {
            if (order.machine_id === machineId && order.ProcessOrderStatus === 'REL') {
                oeeLogger.debug(`Matching process order found: ${JSON.stringify(order)}`);
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
                    breakTime += calculateOverlap(currentTime, nextTime, breakStart, breakEnd);
                }
            });

            durations.unplannedDowntime.forEach(downtime => {
                const downtimeStart = parseDate(downtime.Start);
                const downtimeEnd = parseDate(downtime.End);
                if (currentTime.isBefore(downtimeEnd) && nextTime.isAfter(downtimeStart)) {
                    unplannedDowntime += calculateOverlap(currentTime, nextTime, downtimeStart, downtimeEnd);
                }
            });

            durations.plannedDowntime.forEach(downtime => {
                const downtimeStart = parseDate(downtime.Start);
                const downtimeEnd = parseDate(downtime.End);
                if (currentTime.isBefore(downtimeEnd) && nextTime.isAfter(downtimeStart)) {
                    plannedDowntime += calculateOverlap(currentTime, nextTime, downtimeStart, downtimeEnd);
                }
            });

            durations.microstops.forEach(microstop => {
                const microstopStart = parseDate(microstop.Start);
                const microstopEnd = parseDate(microstop.End);
                if (currentTime.isBefore(microstopEnd) && nextTime.isAfter(microstopStart)) {
                    microstopTime += calculateOverlap(currentTime, nextTime, microstopStart, microstopEnd);
                }
            });

            const totalNonProductionTime = breakTime + unplannedDowntime + plannedDowntime + microstopTime;
            productionTime = Math.max(0, productionTime - totalNonProductionTime);

            oeeLogger.debug(`Interval ${currentTime.format("HH:mm")} - ${nextTime.format("HH:mm")}:`);
            oeeLogger.debug(`  Production time: ${productionTime} minutes`);
            oeeLogger.debug(`  Break time: ${breakTime} minutes`);
            oeeLogger.debug(`  Unplanned downtime: ${unplannedDowntime} minutes`);
            oeeLogger.debug(`  Planned downtime: ${plannedDowntime} minutes`);
            oeeLogger.debug(`  Microstop time: ${microstopTime} minutes`);

            OEEData.datasets[0].data.push(productionTime);
            OEEData.datasets[1].data.push(breakTime);
            OEEData.datasets[2].data.push(unplannedDowntime);
            OEEData.datasets[3].data.push(plannedDowntime);
            OEEData.datasets[4].data.push(microstopTime);

            currentTime = nextTime;
        }

        oeeLogger.debug(`OEE Data: ${JSON.stringify(OEEData)}`);
        return OEEData;
    } catch (error) {
        errorLogger.error(`Error loading or preparing OEE data: ${error.message}`);
        throw error;
    }
}

// Export the functions for use in other modules
module.exports = {
    invalidateCache,
    loadAllData,
    getUnplannedDowntime,
    getPlannedDowntime,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadShiftModelData,
    loadDataAndPrepareOEE,
    getMicrostops
};