const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { oeeLogger, errorLogger } = require('../utils/logger'); // Ensure the logger is correctly imported

const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');

// Caches für die Daten
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;

/**
 * Load JSON data from a file and log its content.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Object} The parsed JSON data.
 */
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

/**
 * Lädt und cached die ungeplanten Ausfallzeiten.
 * @returns {Object} Die ungeplanten Ausfallzeiten.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
        oeeLogger.info(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

/**
 * Lädt und cached die geplanten Ausfallzeiten.
 * @returns {Object} Die geplanten Ausfallzeiten.
 */
function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
        oeeLogger.info(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
    }
    return plannedDowntimeCache;
}

/**
 * Load process order data once and cache it.
 * @returns {Object} The process order data.
 */
function loadProcessOrderData() {
    if (!processOrderDataCache) {
        processOrderDataCache = loadJsonData(processOrderFilePath);
        oeeLogger.info(`Process order data loaded from ${processOrderFilePath}`);
    }
    return processOrderDataCache;
}

/**
 * Load shift model data once and cache it.
 * @returns {Object} The shift model data.
 */
function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath);
        oeeLogger.info(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

/**
 * Parse a date string into a Moment.js object in UTC.
 * @param {string} dateStr - The date string.
 * @returns {Object} Moment.js object.
 */
function parseDate(dateStr) {
    return moment.utc(dateStr);
}

/**
 * Filter downtimes that fall within the specified start and end times.
 * @param {Array} downtimes - The downtimes data.
 * @param {Object} startTime - The start time.
 * @param {Object} endTime - The end time.
 * @returns {Array} Filtered downtimes.
 */
function filterDowntime(downtimes, startTime, endTime) {
    return downtimes.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        return start.isBetween(startTime, endTime, null, '[]') || end.isBetween(startTime, endTime, null, '[]');
    });
}

/**
 * Akkumuliert die Ausfallzeitdifferenz für eine bestimmte ProcessOrderNumber.
 * @param {string} processOrderNumber - Die ProcessOrderNumber.
 * @returns {number} Die ungeplante Ausfallzeit in Minuten.
 */
function getunplannedDowntime(processOrderNumber) {
    try {
        const unplannedDowntimeEntries = loadUnplannedDowntimeData();

        // Differenzen für die angegebene ProcessOrderNumber summieren
        const totalDowntimeMinutes = unplannedDowntimeEntries.reduce((total, entry) => {
            if (entry.ProcessOrderNumber === processOrderNumber) {
                total += entry.Differenz;
            }
            return total;
        }, 0);

        // Akkumulierte Ausfallzeit protokollieren
        oeeLogger.info(`Total accumulated unplanned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing unplannedDowntime.json: ${error.message}`);
        throw error;
    }
}

/**
 * Berechnet die gesamte geplante Ausfallzeit.
 * @param {string} processOrderNumber - Die ProcessOrderNumber.
 * @param {string} startTime - Der Startzeitpunkt des Prozessauftrags.
 * @param {string} endTime - Der Endzeitpunkt des Prozessauftrags.
 * @returns {number} Die gesamte geplante Ausfallzeit in Minuten.
 */
function getPlannedDowntime(processOrderNumber, startTime, endTime) {
    try {
        const plannedDowntimeEntries = loadPlannedDowntimeData();
        const start = parseDate(startTime).valueOf();
        const end = parseDate(endTime).valueOf();

        const totalDowntimeMinutes = plannedDowntimeEntries.reduce((total, entry) => {
            if (!entry.Start || !entry.End) {
                oeeLogger.warn(`Undefined Start or End in entry: ${JSON.stringify(entry)}`);
                return total; // Skip this entry
            }

            const entryStart = parseDate(entry.Start).valueOf();
            const entryEnd = parseDate(entry.End).valueOf();
            oeeLogger.debug(`Processing entry for ProcessOrderNumber ${entry.ProcessOrderNumber}: Start ${entry.Start}, End ${entry.End}`);

            if (entry.ProcessOrderNumber === processOrderNumber && entryStart < end && entryEnd > start) {
                const overlapStart = Math.max(start, entryStart);
                const overlapEnd = Math.min(end, entryEnd);
                const duration = (overlapEnd - overlapStart) / (1000 * 60);
                oeeLogger.debug(`Overlap found: starts at ${new Date(overlapStart)}, ends at ${new Date(overlapEnd)}, duration ${duration} minutes`);
                total += duration;
            }
            return total;
        }, 0);

        oeeLogger.info(`Total accumulated planned downtime for ProcessOrderNumber ${processOrderNumber}: ${totalDowntimeMinutes} minutes`);

        return totalDowntimeMinutes;
    } catch (error) {
        errorLogger.error(`Error reading or processing plannedDowntime.json: ${error.message}`);
        throw error;
    }
}

/**
 * Function to calculate the break duration in minutes.
 * @param {string} breakStart - The break start time (HH:mm format).
 * @param {string} breakEnd - The break end time (HH:mm format).
 * @returns {number} The break duration in minutes.
 */
function calculateBreakDuration(breakStart, breakEnd) {
    const breakStartTime = moment(breakStart, "HH:mm");
    const breakEndTime = moment(breakEnd, "HH:mm");
    return breakEndTime.diff(breakStartTime, 'minutes');
}

/**
 * Filter and calculate durations within the process order.
 * @param {Object} processOrder - The process order data.
 * @param {Array} plannedDowntime - Array of planned downtime data.
 * @param {Array} unplannedDowntime - Array of unplanned downtime data.
 * @param {Array} shifts - Array of shift model data.
 * @returns {Object} Filtered and calculated durations.
 */
function filterAndCalculateDurations(processOrder, plannedDowntime, unplannedDowntime, shifts) {
    const orderStart = parseDate(processOrder.Start).startOf('hour');
    const orderEnd = parseDate(processOrder.End).endOf('hour');

    // Filter planned and unplanned downtimes within the process order
    const filteredPlannedDowntime = plannedDowntime.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        return (start.isBetween(orderStart, orderEnd, null, '[)') || end.isBetween(orderStart, orderEnd, null, '(]'));
    });

    const filteredUnplannedDowntime = unplannedDowntime.filter(downtime => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        return (start.isBetween(orderStart, orderEnd, null, '[)') || end.isBetween(orderStart, orderEnd, null, '(]'));
    });

    // Calculate the break duration for shifts within the process order
    const filteredBreaks = shifts.flatMap(shift => {
        const shiftStart = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.shift_start_time}`, "YYYY-MM-DD HH:mm");
        const shiftEnd = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.shift_end_time}`, "YYYY-MM-DD HH:mm");
        const breakStart = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.break_start}`, "YYYY-MM-DD HH:mm");
        const breakEnd = moment.utc(`${moment(orderStart).format('YYYY-MM-DD')} ${shift.break_end}`, "YYYY-MM-DD HH:mm");

        // Adjust breakStart and breakEnd if they cross midnight
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

/**
 * Load data and prepare chart data.
 * @returns {Object} Chart data.
 */
function loadDataAndPrepareChart() {
    try {
        oeeLogger.info('Loading data and preparing chart data.');
        const processOrders = loadProcessOrderData();
        const plannedDowntime = loadPlannedDowntimeData();
        const unplannedDowntime = loadUnplannedDowntimeData();
        const shifts = loadShiftModelData();

        // Assuming only one process order for simplicity
        const processOrder = processOrders[0];

        // Log process order details
        oeeLogger.debug(`Process order details: ${JSON.stringify(processOrder, null, 2)}`);

        // Filter and calculate durations
        const durations = filterAndCalculateDurations(processOrder, plannedDowntime, unplannedDowntime, shifts);

        // Log filtered durations
        oeeLogger.debug(`Filtered durations: ${JSON.stringify(durations, null, 2)}`);

        // Prepare chart data
        const chartData = {
            labels: [],
            datasets: [
                { label: 'Production', data: [], backgroundColor: 'green' },
                { label: 'Break', data: [], backgroundColor: 'blue' },
                { label: 'Unplanned Downtime', data: [], backgroundColor: 'red' },
                { label: 'Planned Downtime', data: [], backgroundColor: 'orange' }
            ]
        };

        // Start time based on process order start time rounded to the nearest hour
        let currentTime = parseDate(processOrder.Start).startOf('hour');
        const orderEnd = parseDate(processOrder.End).endOf('hour');

        // Log rounded start and end times
        oeeLogger.debug(`Rounded order start time: ${currentTime.format()}`);
        oeeLogger.debug(`Rounded order end time: ${orderEnd.format()}`);

        // Calculate intervals
        while (currentTime.isBefore(orderEnd)) {
            const nextTime = currentTime.clone().add(1, 'hour');

            chartData.labels.push(`${currentTime.format("HH:mm")} - ${nextTime.format("HH:mm")}`);

            let productionTime = nextTime.diff(currentTime, 'minutes');
            let breakTime = 0;
            let unplannedDowntime = 0;
            let plannedDowntime = 0;

            // Subtract break time
            durations.breaks.forEach(breakInfo => {
                const breakStart = moment(breakInfo.breakStart);
                const breakEnd = moment(breakInfo.breakEnd);

                if (currentTime.isBefore(breakEnd) && nextTime.isAfter(breakStart)) {
                    const overlapStart = moment.max(currentTime, breakStart);
                    const overlapEnd = moment.min(nextTime, breakEnd);
                    breakTime += overlapEnd.diff(overlapStart, 'minutes');
                }
            });

            // Subtract unplanned downtime
            durations.unplannedDowntime.forEach(downtime => {
                const downtimeStart = parseDate(downtime.Start);
                const downtimeEnd = parseDate(downtime.End);
                if (currentTime.isBefore(downtimeEnd) && nextTime.isAfter(downtimeStart)) {
                    const overlapStart = moment.max(currentTime, downtimeStart);
                    const overlapEnd = moment.min(nextTime, downtimeEnd);
                    unplannedDowntime += overlapEnd.diff(overlapStart, 'minutes');
                }
            });

            // Subtract planned downtime
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

            // Log each interval's times
            oeeLogger.debug(`Interval ${currentTime.format("HH:mm")} - ${nextTime.format("HH:mm")}:`);
            oeeLogger.debug(`  Production time: ${productionTime} minutes`);
            oeeLogger.debug(`  Break time: ${breakTime} minutes`);
            oeeLogger.debug(`  Unplanned downtime: ${unplannedDowntime} minutes`);
            oeeLogger.debug(`  Planned downtime: ${plannedDowntime} minutes`);

            chartData.datasets[0].data.push(productionTime);
            chartData.datasets[1].data.push(breakTime);
            chartData.datasets[2].data.push(unplannedDowntime);
            chartData.datasets[3].data.push(plannedDowntime);

            currentTime = nextTime;
        }

        oeeLogger.info('Chart data prepared successfully.');
        oeeLogger.info(`Chart Data: ${JSON.stringify(chartData)}`);

        return chartData;

    } catch (error) {
        errorLogger.error(`Error loading or preparing chart data: ${error.message}`);
        throw error;
    }
}

module.exports = {
    getunplannedDowntime,
    getPlannedDowntime,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadShiftModelData,
    loadDataAndPrepareChart
};