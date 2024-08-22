/**
 * @module OEECalculator
 * Module for calculating OEE (Overall Equipment Effectiveness) metrics.
 */

const axios = require('axios');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { oeeLogger, errorLogger, defaultLogger } = require('../utils/logger');
const { influxdb, oeeAsPercent, oeeApiUrl } = require('../config/config');
const { loadDataAndPrepareOEE } = require('../src/downtimeManager');
const { loadProcessOrderData } = require('../src/dataLoader');

// Constants
/**
 * The maximum valid score threshold.
 * @constant {number}
 */
const VALID_SCORE_THRESHOLD = 1.0;

/**
 * The minimum valid score threshold.
 * @constant {number}
 */
const MINIMUM_SCORE_THRESHOLD = 0.0;

/**
 * Classification levels for OEE scores.
 * @constant {Object}
 */
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: 0.85,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    AVERAGE: 0.4,
};

/**
 * Class representing an OEE Calculator.
 */
class OEECalculator {
    constructor() {
        /**
         * Stores OEE data for multiple machines.
         * @type {Object.<string, Object>}
         */
        this.oeeData = {};
    }

    /**
     * Resets the OEE data structure to its default values.
     * @returns {Object} The default OEE data structure.
     */
    resetOEEData() {
        return {
            ProcessOrderNumber: null,
            MaterialNumber: null,
            MaterialDescription: null,
            plannedProduction: 0,
            runtime: 0,
            actualPerformance: 0,
            targetPerformance: 0,
            goodProducts: 0,
            totalProduction: 0,
            unplannedDowntime: 600,
            setupTime: 0,
            processingTime: 0,
            teardownTime: 0,
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0,
            StartTime: null,
            EndTime: null,
        };
    }

    /**
     * Initializes the OEE Calculator with data for a given machine.
     * @param {string} machineId - The ID of the machine to initialize.
     * @throws Will throw an error if no active process order with status 'REL' is found.
     */
    async init(machineId) {
        try {
            oeeLogger.info(`Initializing OEECalculator for machineId ${machineId}`);
            const processOrderData = await loadProcessOrderData(machineId);
            const filteredOrders = processOrderData.filter(order => order.ProcessOrderStatus === 'REL');
            oeeLogger.info(`Filtered process orders for machineId ${machineId}: ${JSON.stringify(filteredOrders)}`);

            if (!filteredOrders || filteredOrders.length === 0) {
                throw new Error(`No active process order with status 'REL' found for machineId ${machineId}.`);
            }
            this.validateProcessOrderData(filteredOrders);
            this.setOEEData(filteredOrders[0], machineId);
            oeeLogger.info(`OEE Data set for machineId ${machineId}: ${JSON.stringify(this.oeeData[machineId])}`);
        } catch (error) {
            errorLogger.error(`Error initializing OEECalculator for machineId ${machineId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validates process order data for required fields.
     * @param {Object[]} data - The process order data to validate.
     * @throws Will throw an error if required fields are missing or invalid.
     */
    validateProcessOrderData(data) {
        data.forEach(order => {
            const requiredFields = ['ProcessOrderNumber', 'MaterialNumber', 'MaterialDescription', 'Start', 'End', 'setupTime', 'processingTime', 'teardownTime', 'totalPartsToBeProduced', 'goodProducts', 'totalProduction'];
            requiredFields.forEach(field => {
                if (!order[field]) {
                    const errorMsg = `Invalid process order data: Missing ${field} in order ${JSON.stringify(order)}`;
                    errorLogger.error(errorMsg);
                    throw new Error(errorMsg);
                }
            });
        });
    }

    /**
     * Sets the OEE data for a specific machine.
     * @param {Object} data - The data to set for the machine.
     * @param {string} machineId - The ID of the machine.
     */
    setOEEData(data, machineId) {
        if (!this.oeeData[machineId]) {
            this.oeeData[machineId] = this.resetOEEData();
        }

        const {
            ProcessOrderNumber,
            MaterialNumber,
            MaterialDescription,
            setupTime,
            processingTime,
            teardownTime,
            Start,
            End,
            totalPartsToBeProduced,
            goodProducts,
            totalProduction
        } = data;

        oeeLogger.debug(`Setting OEE Data for machineId ${machineId}: ProcessOrderNumber=${ProcessOrderNumber}, MaterialNumber=${MaterialNumber}, MaterialDescription=${MaterialDescription}`);

        this.oeeData[machineId] = {
            ...this.oeeData[machineId],
            ProcessOrderNumber,
            MaterialNumber,
            MaterialDescription,
            plannedProduction: setupTime + processingTime + teardownTime,
            runtime: setupTime + processingTime + teardownTime,
            targetPerformance: totalPartsToBeProduced,
            goodProducts,
            totalProduction,
            setupTime,
            processingTime,
            teardownTime,
            StartTime: Start,
            EndTime: End,
        };
    }

    /**
     * Updates a specific metric for a given machine.
     * @param {string} metric - The metric to update.
     * @param {number} value - The value to update the metric with.
     * @param {string} machineId - The ID of the machine.
     */
    updateData(metric, value, machineId) {
        oeeLogger.debug(`Updating ${metric} with value: ${value} for machineId: ${machineId}`);
        if (!this.oeeData[machineId]) {
            this.oeeData[machineId] = this.resetOEEData();
        }
        this.oeeData[machineId][metric] = value;
    }

    /**
     * Validates the input data for a machine before OEE calculation.
     * @param {string} machineId - The ID of the machine.
     * @throws Will throw an error if any input data is invalid.
     */
    validateInput(machineId) {
        const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction } = this.oeeData[machineId];

        if (runtime <= 0) throw new Error('Invalid input data: runtime must be greater than 0');
        if (plannedProduction <= 0) throw new Error('Invalid input data: plannedProduction must be greater than 0');
        if (totalProduction < 0) throw new Error('Invalid input data: totalProduction must be non-negative');
        if (targetPerformance < 0) throw new Error('Invalid input data: targetPerformance must be non-negative');
        if (goodProducts < 0) throw new Error('Invalid input data: goodProducts must be non-negative');
        if (totalProduction > targetPerformance) throw new Error('Invalid input data: totalProduction cannot be greater than targetPerformance');
        if (goodProducts > totalProduction) throw new Error('Invalid input data: goodProducts cannot be greater than totalProduction');
    }

    /**
     * Calculates OEE metrics for a specific machine.
     * @param {string} machineId - The ID of the machine.
     * @param {number} totalUnplannedDowntime - The total unplanned downtime in minutes.
     * @param {number} totalPlannedDowntime - The total planned downtime in minutes.
     * @throws Will throw an error if the OEE calculation fails.
     */
    async calculateMetrics(machineId, totalUnplannedDowntime, totalPlannedDowntime) {
        if (!this.oeeData[machineId]) {
            throw new Error(`No data found for machineId: ${machineId}`);
        }

        this.validateInput(machineId);

        const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, ProcessOrderNumber, StartTime, EndTime, MaterialNumber, MaterialDescription } = this.oeeData[machineId];
        oeeLogger.info(`Calculating metrics for ProcessOrderNumber: ${ProcessOrderNumber} on machineId: ${machineId}`);

        try {
            const OEEData = loadDataAndPrepareOEE(machineId);

            if (!OEEData || !Array.isArray(OEEData.datasets)) {
                throw new Error('Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array.');
            }

            const totalProductionTime = OEEData.datasets[0].data.reduce((a, b) => a + b, 0);
            const totalBreakTime = OEEData.datasets[1].data.reduce((a, b) => a + b, 0);
            const actualUnplannedDowntime = totalUnplannedDowntime || OEEData.datasets[2].data.reduce((a, b) => a + b, 0);
            const actualPlannedDowntime = totalPlannedDowntime || OEEData.datasets[3].data.reduce((a, b) => a + b, 0);

            oeeLogger.debug(`Total production time: ${totalProductionTime}`);
            oeeLogger.debug(`Total break time: ${totalBreakTime}`);
            oeeLogger.debug(`Total unplanned downtime: ${actualUnplannedDowntime}`);
            oeeLogger.debug(`Total planned downtime: ${actualPlannedDowntime}`);

            oeeLogger.info(`Input values for machineId ${machineId} - plannedProduction: ${plannedProduction}, runtime: ${runtime}, targetPerformance: ${targetPerformance}, goodProducts: ${goodProducts}, totalProduction: ${totalProduction}, MaterialNumber: ${MaterialNumber}, MaterialDescription: ${MaterialDescription}`);

            this.calculateOEE({
                plannedProduction,
                runtime,
                targetPerformance,
                goodProducts,
                totalProduction,
                actualUnplannedDowntime,
                actualPlannedDowntime,
                machineId,
            });

            oeeLogger.info(`Calculated OEE data for machineId ${machineId}: ${JSON.stringify(this.oeeData[machineId])}`);
        } catch (error) {
            errorLogger.warn(`Warning calculating metrics for machineId ${machineId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculates the OEE for a specific machine based on the provided data.
     * @param {Object} data - The data used for OEE calculation.
     */
    calculateOEE(data) {
        const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, actualUnplannedDowntime, actualPlannedDowntime, machineId } = data;
        const operatingTime = runtime - (actualUnplannedDowntime / 60) - (actualPlannedDowntime / 60);

        this.oeeData[machineId].availability = operatingTime / plannedProduction;
        this.oeeData[machineId].performance = targetPerformance > 0 ? totalProduction / targetPerformance : 0;
        this.oeeData[machineId].quality = totalProduction > 0 ? goodProducts / totalProduction : 0;
        this.oeeData[machineId].oee = this.oeeData[machineId].availability * this.oeeData[machineId].performance * this.oeeData[machineId].quality * 100;

        if (!isFinite(this.oeeData[machineId].oee)) {
            throw new Error(`Calculated OEE is not finite: ${this.oeeData[machineId].oee}`);
        }

        this.oeeData[machineId].classification = this.classifyOEE(this.oeeData[machineId].oee / 100);
    }

    /**
     * Classifies the OEE score into a category.
     * @param {number} score - The OEE score.
     * @returns {string} The classification of the OEE score.
     * @throws Will throw an error if the score is out of bounds.
     */
    classifyOEE(score) {
        if (score > VALID_SCORE_THRESHOLD || score < MINIMUM_SCORE_THRESHOLD) {
            throw new Error(`Invalid input: score must be between ${MINIMUM_SCORE_THRESHOLD} and ${VALID_SCORE_THRESHOLD}`);
        }
        if (score >= CLASSIFICATION_LEVELS.WORLD_CLASS) return "World Class";
        if (score >= CLASSIFICATION_LEVELS.EXCELLENT) return "Excellent";
        if (score >= CLASSIFICATION_LEVELS.GOOD) return "Good";
        if (score >= CLASSIFICATION_LEVELS.AVERAGE) return "Average";
        return "Poor";
    }

    /**
     * Retrieves the calculated OEE metrics for a specific machine.
     * @param {string} machineId - The ID of the machine.
     * @returns {Object} The OEE metrics for the machine.
     */
    getMetrics(machineId) {
        return this.oeeData[machineId];
    }
}

/**
 * Writes the OEE data to InfluxDB.
 * @async
 * @param {Object} metrics - The OEE metrics to write to the database.
 */

/**
 * Writes the OEE data to InfluxDB via the API.
 * @async
 * @param {Object} metrics - The OEE metrics to send to the API.
 */
async function writeOEEToInfluxDB(metrics) {
    try {
        const response = await axios.post(`${oeeApiUrl}/write-oee-metrics`, metrics);
        return response.data; // Optional: return data from API if needed
    } catch (error) {
        oeeLogger.error('Error sending OEE metrics to API:', error.response ? error.response.data : error.message);
        throw error; // Rethrowing the error to be handled by the caller
    }
}

// Export the OEECalculator class and writeOEEToInfluxDB function for use in other modules
module.exports = { OEECalculator, writeOEEToInfluxDB };