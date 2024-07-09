// Import necessary modules and functions
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { oeeLogger, errorLogger } = require('./logger');
const { influxdb, oeeAsPercent } = require('../config/config');
const { loadProcessOrderData, loadPlannedDowntimeData } = require('../utils/dataLoader');
const { unplannedDowntime, getPlannedDowntime, calculateTotalPlannedDowntime } = require('../utils/downtimeManager');

// Constants for OEE calculation and classification levels
const VALID_SCORE_THRESHOLD = 1.0;
const MINIMUM_SCORE_THRESHOLD = 0.0;
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: 0.85,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    AVERAGE: 0.4,
};
const DEFAULT_UNPLANNED_DOWNTIME = 600; // Default unplanned downtime in seconds (10 minutes)

/**
 * OEECalculator class handles the calculation of Overall Equipment Effectiveness (OEE)
 * based on provided metrics.
 */
class OEECalculator {
    constructor() {
        // Load process order data once
        const processOrderData = loadProcessOrderData();

        // Initialize OEE data with default values
        this.oeeData = {
            ProcessOrderNumber: processOrderData.ProcessOrderNumber, // Process order number
            plannedProduction: processOrderData.setupTime + processOrderData.processingTime + processOrderData.teardownTime, // Total planned production time (minutes)
            runtime: processOrderData.setupTime + processOrderData.processingTime + processOrderData.teardownTime, // Actual runtime of the machine (minutes)
            actualPerformance: 0, // Actual number of units produced
            targetPerformance: processOrderData.totalPartsToBeProduced, // Target number of units to be produced
            goodProducts: 0, // Number of units produced without defects
            totalProduction: 0, // Total number of units produced, including defects
            unplannedDowntime: DEFAULT_UNPLANNED_DOWNTIME, // Unplanned downtime (default 10 minutes)
            availability: 0, // Calculated availability percentage
            performance: 0, // Calculated performance percentage
            quality: 0, // Calculated quality percentage
            oee: 0, // Calculated Overall Equipment Effectiveness (OEE) percentage
        };

        // Load and cache planned downtime data
        this.plannedDowntimeData = loadPlannedDowntimeData();
    }

    /**
     * Updates the value of a specific metric in the OEE data.
     * @param {string} metric - The name of the metric to update.
     * @param {number} value - The value to set for the metric.
     */
    updateData(metric, value) {
        oeeLogger.debug(`Updating ${metric} with value: ${value}`);
        this.oeeData[metric] = value;
    }

    /**
     * Validates the input metrics to ensure they are within acceptable ranges.
     * Throws an error if any validation checks fail.
     */
    validateInput() {
        const { plannedProduction, runtime, actualPerformance, targetPerformance, goodProducts, totalProduction } = this.oeeData;
        try {
            if (runtime <= 0) {
                const msg = "Invalid input: Operating time must be a positive number.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (runtime > plannedProduction) {
                const msg = "Invalid input: Total operating time cannot exceed planned production time.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (plannedProduction <= 0) {
                const msg = "Invalid input: Planned production time must be a positive number.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (totalProduction < 0 || targetPerformance < 0 || goodProducts < 0) {
                const msg = "Invalid input: Parts counts cannot be negative.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (totalProduction > targetPerformance) {
                const msg = `Invalid input: Total parts produced (${totalProduction}) cannot exceed total parts to be produced (${targetPerformance}).`;
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (goodProducts > totalProduction) {
                const msg = "Invalid input: Good parts cannot exceed total parts produced.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            oeeLogger.debug('Input validated successfully.');
        } catch (error) {
            throw error;
        }
    }

    /**
     * Calculates the OEE metrics including availability, performance, and quality.
     * Uses the validated input data to compute these values and logs the results.
     * Throws an error if any calculation step fails.
     */
    calculateMetrics() {
        try {
            this.validateInput();

            const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, ProcessOrderNumber } = this.oeeData;

            // Calculate unplanned downtime in minutes
            const unplannedDowntimeMinutes = unplannedDowntime(ProcessOrderNumber);

            // Use default unplanned downtime if no value is provided
            const actualUnplannedDowntime = unplannedDowntimeMinutes !== undefined ? unplannedDowntimeMinutes : DEFAULT_UNPLANNED_DOWNTIME;

            // Calculate availability
            const operatingTime = runtime - (actualUnplannedDowntime / 60); // Convert seconds to minutes
            if (operatingTime <= 0 || plannedProduction <= 0) {
                throw new Error("Calculated operating time or planned production time is invalid");
            }
            this._availability = operatingTime / plannedProduction;
            oeeLogger.info(`Calculated Availability: ${this._availability}`);

            // Calculate performance
            this._idealCycleTime = plannedProduction / targetPerformance;
            if (operatingTime <= 0) {
                throw new Error("Operating time must be greater than zero for performance calculation");
            }
            this._performance = (this._idealCycleTime * totalProduction) / plannedProduction; // Corrected calculation
            oeeLogger.info(`Calculated Performance: ${this._performance}`);

            // Calculate quality
            if (totalProduction <= 0) {
                throw new Error("Total production must be greater than zero for quality calculation");
            }
            this._quality = goodProducts / totalProduction;
            oeeLogger.info(`Calculated Quality: ${this._quality}`);

            // Calculate OEE
            this._oee = this._availability * this._performance * this._quality * 100;
            oeeLogger.info(`Calculated OEE: ${this._oee}`);

            // Ensure OEE is a finite number
            if (!isFinite(this._oee)) {
                const msg = `Calculated OEE is not finite: ${this._oee}`;
                errorLogger.error(msg);
                throw new Error(msg);
            }

            // Classify the OEE score
            this._classification = this.classifyOEE(this._oee / 100);
            oeeLogger.info(`Classified OEE: ${this._classification}`);

        } catch (error) {
            errorLogger.error(`Error during metric calculation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Classifies the OEE score into predefined categories.
     * @param {number} score - The OEE score to classify.
     * @returns {string} - The classification of the OEE score.
     */
    classifyOEE(score) {
        if (score > VALID_SCORE_THRESHOLD || score < MINIMUM_SCORE_THRESHOLD) {
            const msg = `Invalid input: score must be between ${MINIMUM_SCORE_THRESHOLD} and ${VALID_SCORE_THRESHOLD}`;
            errorLogger.error(msg);
            throw new Error(msg);
        }
        if (score >= CLASSIFICATION_LEVELS.WORLD_CLASS) return "World Class";
        if (score >= CLASSIFICATION_LEVELS.EXCELLENT) return "Excellent";
        if (score >= CLASSIFICATION_LEVELS.GOOD) return "Good";
        if (score >= CLASSIFICATION_LEVELS.AVERAGE) return "Average";
        return "Poor";
    }

    /**
     * Retrieves the calculated OEE metrics.
     * @returns {Object} - An object containing the OEE, availability, performance, quality, and classification metrics.
     */
    getMetrics() {
        return {
            oee: this._oee,
            availability: this._availability,
            performance: this._performance,
            quality: this._quality,
            classification: this._classification,
        };
    }
}

// Initialize InfluxDB write API if configuration is provided
let writeApi = null;

try {
    if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
        const influxDB = new InfluxDB({ url: influxdb.url, token: influxdb.token });
        writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);
    } else {
        throw new Error('InfluxDB configuration is incomplete.');
    }
} catch (error) {
    errorLogger.error(`InfluxDB initialization error: ${error.message}`);
}

/**
 * Writes the OEE metrics to InfluxDB.
 * @param {number} oee - The calculated OEE value.
 * @param {number} availability - The calculated availability value.
 * @param {number} performance - The calculated performance value.
 * @param {number} quality - The calculated quality value.
 * @param {Object} metadata - Additional metadata to tag the data points.
 */
async function writeOEEToInfluxDB(oee, availability, performance, quality, metadata) {
    if (!writeApi) {
        errorLogger.error('InfluxDB write API is not initialized.');
        return;
    }

    try {
        // Create a new InfluxDB point with tags and fields
        const point = new Point('oee')
            .tag('plant', metadata.group_id)
            .tag('area', 'Packaging')
            .tag('line', metadata.edge_node_id);

        Object.keys(metadata).forEach(key => {
            if (typeof metadata[key] !== 'object') {
                point.tag(key, metadata[key]);
            }
        });

        point
            .floatField('oee', oeeAsPercent ? oee : oee / 100)
            .floatField('availability', oeeAsPercent ? availability * 100 : availability)
            .floatField('performance', oeeAsPercent ? performance * 100 : performance)
            .floatField('quality', oeeAsPercent ? quality * 100 : quality);

        // Write the point to InfluxDB
        writeApi.writePoint(point);
        await writeApi.flush();
    } catch (error) {
        errorLogger.error(`Error writing to InfluxDB: ${error.message}`);
    }
}

// Export the OEECalculator class and the writeOEEToInfluxDB function
module.exports = { OEECalculator, writeOEEToInfluxDB };