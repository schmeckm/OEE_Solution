const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { oeeLogger, errorLogger } = require('../utils/logger');

const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');

let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;

// Load JSON data from a file with caching
function loadJsonData(filePath) {
    try {
        oeeLogger.debug(`Loading JSON data from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        oeeLogger.info(`Content of ${filePath} loaded successfully`);
        return jsonData;
    } catch (error) {
        errorLogger.error(`Error loading JSON data from ${filePath}: ${error.message}`);
        throw error;
    }
}

// Load data functions with caching
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
        oeeLogger.info(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
        oeeLogger.info(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
    }
    return plannedDowntimeCache;
}

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


function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath);
        oeeLogger.info(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

function parseDate(dateStr) {
    return moment.utc(dateStr);
}

// Get unplanned downtime filtered by process order number or machine ID
function getPlannedDowntime(processOrderNumber, startTime, endTime) {
    try {
        const plannedDowntimeEntries = loadPlannedDowntimeData();

        if (!Array.isArray(plannedDowntimeEntries)) {
            throw new Error("Expected an array from loadPlannedDowntimeData");
        }

        const start = parseDate(startTime).valueOf();
        const end = parseDate(endTime).valueOf();

        const filteredEntries = plannedDowntimeEntries.filter(entry => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return false;
            }

            const entryStart = parseDate(entry.Start).valueOf();
            const entryEnd = parseDate(entry.End).valueOf();

            return entry.ProcessOrderNumber === processOrderNumber && entryStart < end && entryEnd > start;
        });

        return filteredEntries.reduce((total, entry) => {
            const overlapStart = Math.max(start, parseDate(entry.Start).valueOf());
            const overlapEnd = Math.min(end, parseDate(entry.End).valueOf());
            const duration = (overlapEnd - overlapStart) / (1000 * 60);
            total += duration;
            return total;
        }, 0);

    } catch (error) {
        errorLogger.error(`Error reading or processing plannedDowntime.json: ${error.message}`);
        throw error;
    }
}


// Get planned downtime filtered by process order number and time range
function getUnplannedDowntime({ processOrderNumber = null, machineId = null }) {
    try {
        const unplannedDowntimeEntries = loadUnplannedDowntimeData();

        if (!Array.isArray(unplannedDowntimeEntries)) {
            throw new Error("Expected an array from loadUnplannedDowntimeData");
        }

        const filteredEntries = unplannedDowntimeEntries.filter(entry => {
            if (processOrderNumber) {
                return entry.ProcessOrderNumber === processOrderNumber;
            } else if (machineId) {
                return entry.machine_id === machineId;
            }
            return false;
        });

        return filteredEntries.reduce((total, entry) => {
            total += entry.Differenz;
            return total;
        }, 0);

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
function filterAndCalculateDurations(processOrder, plannedDowntime, unplannedDowntime, shifts) {
    const orderStart = parseDate(processOrder.Start).startOf('hour');
    const orderEnd = parseDate(processOrder.End).endOf('hour');

    const filteredPlannedDowntime = plannedDowntime.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        return start.isBetween(orderStart, orderEnd, null, '[]') || end.isBetween(orderStart, orderEnd, null, '[]');
    });

    const filteredUnplannedDowntime = unplannedDowntime.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        return start.isBetween(orderStart, orderEnd, null, '[]') || end.isBetween(orderStart, orderEnd, null, '[]');
    });

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
        breaks: filteredBreaks
    };
}

// Main function to load data and prepare OEE calculations
function loadDataAndPrepareOEE(machineId) {
    oeeLogger.debug(`Inside loadDataAndPrepareOEE with machineId: ${machineId}`);

    // Ensure machineId is provided
    if (!machineId) {
        throw new Error('MachineId is required to load and prepare OEE data.');
    }

    try {
        oeeLogger.info('Loading data and preparing OEE data.');

        // Load and filter process orders by machineId and status 'REL'
        const processOrders = loadProcessOrderData().filter(order => {
            oeeLogger.debug(`Checking process order: ${JSON.stringify(order)}`);
            return order.machine_id === machineId && order.ProcessOrderStatus === 'REL';
        });

        // If no running process orders are found, throw an error
        if (processOrders.length === 0) {
            throw new Error(`No running process orders found for machineId: ${machineId}`);
        }

        // Assuming only one process order is running per machine
        const currentProcessOrder = processOrders[0];
        const processOrderNumber = currentProcessOrder.ProcessOrderNumber;
        const processOrderStartTime = currentProcessOrder.Start;
        const processOrderEndTime = currentProcessOrder.End;

        oeeLogger.debug(`Current process order details: ${JSON.stringify(currentProcessOrder, null, 2)}`);

        // Get planned and unplanned downtimes using helper functions
        let plannedDowntime = getPlannedDowntime(processOrderNumber, processOrderStartTime, processOrderEndTime);
        let unplannedDowntime = getUnplannedDowntime({ processOrderNumber });

        // Ensure plannedDowntime and unplannedDowntime are arrays
        if (!Array.isArray(plannedDowntime)) {
            oeeLogger.warn('Planned downtime is not an array, defaulting to empty array.');
            plannedDowntime = [];
        }
        if (!Array.isArray(unplannedDowntime)) {
            oeeLogger.warn('Unplanned downtime is not an array, defaulting to empty array.');
            unplannedDowntime = [];
        }

        // Filter shifts by machineId
        const shifts = loadShiftModelData().filter(shift => shift.machine_id === machineId);

        oeeLogger.debug(`Filtered shifts: ${JSON.stringify(shifts, null, 2)}`);

        // Calculate durations based on filtered downtimes and breaks
        const durations = filterAndCalculateDurations(currentProcessOrder, plannedDowntime, unplannedDowntime, shifts);
        oeeLogger.debug(`Filtered durations: ${JSON.stringify(durations, null, 2)}`);

        const OEEData = {
            labels: [],
            datasets: [
                { label: 'Production', data: [], backgroundColor: 'green' },
                { label: 'Break', data: [], backgroundColor: 'blue' },
                { label: 'Unplanned Downtime', data: [], backgroundColor: 'red' },
                { label: 'Planned Downtime', data: [], backgroundColor: 'orange' }
            ]
        };

        let currentTime = parseDate(currentProcessOrder.Start).startOf('hour');
        const orderEnd = parseDate(currentProcessOrder.End).endOf('hour');

        oeeLogger.debug(`Rounded order start time: ${currentTime.format()}`);
        oeeLogger.debug(`Rounded order end time: ${orderEnd.format()}`);

        // Populate OEE data for each hour in the process order time range
        while (currentTime.isBefore(orderEnd)) {
            const nextTime = currentTime.clone().add(1, 'hour');

            OEEData.labels.push(currentTime.toISOString());

            let productionTime = nextTime.diff(currentTime, 'minutes');
            let breakTime = 0;
            let unplannedDowntime = 0;
            let plannedDowntime = 0;

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

            productionTime -= (breakTime + unplannedDowntime + plannedDowntime);

            oeeLogger.debug(`Interval ${currentTime.format("HH:mm")} - ${nextTime.format("HH:mm")}:`);
            oeeLogger.debug(`  Production time: ${productionTime} minutes`);
            oeeLogger.debug(`  Break time: ${breakTime} minutes`);
            oeeLogger.debug(`  Unplanned downtime: ${unplannedDowntime} minutes`);
            oeeLogger.debug(`  Planned downtime: ${plannedDowntime} minutes`);

            OEEData.datasets[0].data.push(productionTime);
            OEEData.datasets[1].data.push(breakTime);
            OEEData.datasets[2].data.push(unplannedDowntime);
            OEEData.datasets[3].data.push(plannedDowntime);

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
    loadDataAndPrepareOEE
};