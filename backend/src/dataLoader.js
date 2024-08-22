const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const dotenv = require('dotenv');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { loadJsonData } = require('./dataService');

// Load environment variables from .env file
dotenv.config();

// Paths to data files
const unplannedDowntimeFilePath = path.resolve(__dirname, '../data/unplannedDowntime.json');
const plannedDowntimeFilePath = path.resolve(__dirname, '../data/plannedDowntime.json');
const processOrderFilePath = path.resolve(__dirname, '../data/processOrder.json');
const shiftModelFilePath = path.resolve(__dirname, '../data/shiftModel.json');
const machineStoppagesFilePath = path.resolve(__dirname, '../data/microstops.json');
const machineFilePath = path.resolve(__dirname, '../data/machine.json'); // Path to machine.json

// Caches for data
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let machineStoppagesCache = null;
let machineDataCache = null; // Cache for machine.json

/**
 * Load and cache machine data.
 * 
 * @returns {Array} The machine data.
 * @throws {Error} Will throw an error if the machine data cannot be loaded.
 */
function loadMachineData() {
    if (!machineDataCache) {
        machineDataCache = loadJsonData(machineFilePath);
        oeeLogger.debug(`Machine data loaded from ${machineFilePath}`);
    }
    return machineDataCache;
}

/**
 * Load and cache unplanned downtime data.
 * 
 * @returns {Object} The unplanned downtime data.
 * @throws {Error} Will throw an error if the unplanned downtime data cannot be loaded.
 */
function loadUnplannedDowntimeData() {
    if (!unplannedDowntimeCache) {
        unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath, ['Start', 'End']);
        oeeLogger.debug(`Unplanned downtime data loaded from ${unplannedDowntimeFilePath}`);
    }
    return unplannedDowntimeCache;
}

/**
 * Load and cache planned downtime data.
 * 
 * @returns {Object} The planned downtime data.
 * @throws {Error} Will throw an error if the planned downtime data cannot be loaded.
 */
function loadPlannedDowntimeData() {
    if (!plannedDowntimeCache) {
        plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath, ['Start', 'End']);
        oeeLogger.debug(`Planned downtime data loaded from ${plannedDowntimeFilePath}`);
    }
    return plannedDowntimeCache;
}

/**
 * Load process order data once and cache it.
 * 
 * @returns {Object} The process order data.
 * @throws {Error} Will throw an error if the process order data is invalid or cannot be loaded.
 */
function loadProcessOrderData() {
    if (!processOrderDataCache) {
        let processOrderData = loadJsonData(processOrderFilePath, ['Start', 'End']);

        // Log the loaded data
        oeeLogger.debug(`Loaded process order data: ${JSON.stringify(processOrderData, null, 2)}`);

        processOrderData = validateProcessOrderData(processOrderData);
        processOrderDataCache = processOrderData;

        oeeLogger.debug(`Process order data loaded from ${processOrderFilePath}`);
    }
    return processOrderDataCache;
}

/**
 * Load shift model data once and cache it.
 * 
 * @returns {Object} The shift model data.
 * @throws {Error} Will throw an error if the shift model data cannot be loaded.
 */
function loadShiftModelData() {
    if (!shiftModelDataCache) {
        shiftModelDataCache = loadJsonData(shiftModelFilePath, ['Start', 'End']);
        oeeLogger.debug(`Shift model data loaded from ${shiftModelFilePath}`);
    }
    return shiftModelDataCache;
}

/**
 * Load and cache machine stoppages data.
 * 
 * @returns {Object} The machine stoppages data.
 * @throws {Error} Will throw an error if the machine stoppages data cannot be loaded.
 */
function loadMachineStoppagesData() {
    if (!machineStoppagesCache) {
        machineStoppagesCache = loadJsonData(machineStoppagesFilePath, ['Start', 'End']);
        oeeLogger.debug(`Machine stoppages data loaded from ${machineStoppagesFilePath}`);
    }
    return machineStoppagesCache;
}

/**
 * Validate process order data.
 * 
 * @param {Array<Object>} data - The process order data.
 * @returns {Array<Object>} The validated process order data.
 * @throws {Error} Will throw an error if the data is invalid.
 */
function validateProcessOrderData(data) {
    data.forEach(order => {
        oeeLogger.debug(`Validating process order: ProcessOrderNumber=${order.ProcessOrderNumber}, MaterialNumber=${order.MaterialNumber}`);
        if (!order.ProcessOrderNumber || !order.MaterialNumber || !order.MaterialDescription) {
            const errorMsg = `Invalid process order data: Missing essential fields in order ${JSON.stringify(order)}`;
            errorLogger.error(errorMsg);
            throw new Error(errorMsg);
        }
        if (order.goodProducts > order.totalProduction) {
            const errorMsg = `Invalid input data: goodProducts (${order.goodProducts}) cannot be greater than totalProduction (${order.totalProduction})`;
            errorLogger.error(errorMsg);
            throw new Error(errorMsg);
        }
    });
    return data;
}

/**
 * Get unplanned downtime for a specific machine.
 * 
 * @param {string} machineId - The machine ID.
 * @param {string} startTime - The start time of the process order.
 * @param {string} endTime - The end time of the process order.
 * @returns {number} - The total unplanned downtime in minutes.
 * @throws {Error} Will throw an error if there is an issue with calculating unplanned downtime.
 */
function getUnplannedDowntimeByMachine(machineId, startTime, endTime) {
    const unplannedDowntimes = loadUnplannedDowntimeData();
    const start = moment(startTime);
    const end = moment(endTime);

    return unplannedDowntimes
        .filter(entry => entry.machine_id === machineId)
        .reduce((total, entry) => {
            const entryStart = moment(entry.Start);
            const entryEnd = moment(entry.End);

            if (entryEnd.isAfter(start) && entryStart.isBefore(end)) {
                const overlapStart = moment.max(start, entryStart);
                const overlapEnd = moment.min(end, entryEnd);
                total += overlapEnd.diff(overlapStart, 'minutes');
            }
            return total;
        }, 0);
}

/**
 * Get planned downtime for a specific machine.
 * 
 * @param {string} machineId - The machine ID.
 * @param {string} startTime - The start time of the process order.
 * @param {string} endTime - The end time of the process order.
 * @returns {number} - The total planned downtime in minutes.
 * @throws {Error} Will throw an error if there is an issue with calculating planned downtime.
 */
function getPlannedDowntimeByMachine(machineId, startTime, endTime) {
    const plannedDowntimes = loadPlannedDowntimeData();
    const start = moment(startTime);
    const end = moment(endTime);

    return plannedDowntimes
        .filter(entry => entry.machine_id === machineId)
        .reduce((total, entry) => {
            const entryStart = moment(entry.Start);
            const entryEnd = moment(entry.End);

            if (entryEnd.isAfter(start) && entryStart.isBefore(end)) {
                const overlapStart = moment.max(start, entryStart);
                const overlapEnd = moment.min(end, entryEnd);
                total += overlapEnd.diff(overlapStart, 'minutes');
            }
            return total;
        }, 0);
}

/**
 * Get total machine stoppage time for a specific process order.
 * 
 * @param {string} processOrderNumber - The process order number.
 * @returns {number} - The total machine stoppage time in minutes.
 * @throws {Error} Will throw an error if there is an issue with calculating machine stoppage time.
 */
function getTotalMachineStoppageTimeByProcessOrder(processOrderNumber) {
    const stoppages = loadMachineStoppagesData();
    return stoppages
        .filter(stoppage => stoppage.ProcessOrderNumber === processOrderNumber)
        .reduce((total, stoppage) => {
            total += stoppage.Differenz; // Sum the difference (in seconds)
            return total;
        }, 0) / 60; // Return in minutes
}

/**
 * Get total machine stoppage time for a specific machine and period.
 * 
 * @param {string} machineId - The machine ID.
 * @param {string} startTime - The start time.
 * @param {string} endTime - The end time.
 * @returns {number} - The total machine stoppage time in minutes.
 * @throws {Error} Will throw an error if there is an issue with calculating machine stoppage time.
 */
function getTotalMachineStoppageTimeByLineAndPeriod(machineId, startTime, endTime) {
    const stoppages = loadMachineStoppagesData();
    const start = moment(startTime);
    const end = moment(endTime);

    return stoppages
        .filter(stoppage => stoppage.machine_id === machineId && moment(stoppage.Start).isBetween(start, end, null, '[]'))
        .reduce((total, stoppage) => {
            total += stoppage.Differenz; // Sum the difference (in seconds)
            return total;
        }, 0) / 60; // Return in minutes
}

module.exports = {
    loadMachineData,
    loadProcessOrderData,
    loadUnplannedDowntimeData,
    loadPlannedDowntimeData,
    loadShiftModelData,
    loadMachineStoppagesData,
    validateProcessOrderData,
    getUnplannedDowntimeByMachine,
    getPlannedDowntimeByMachine,
    getTotalMachineStoppageTimeByProcessOrder,
    getTotalMachineStoppageTimeByLineAndPeriod,
};