const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { influxdb, oeeAsPercent } = require('../config/config');
const { loadDataAndPrepareOEE } = require('../utils/downtimeManager');
const { loadProcessOrderData } = require('../src/dataLoader');

// Constants for OEE classification
const VALID_SCORE_THRESHOLD = 1.0;
const MINIMUM_SCORE_THRESHOLD = 0.0;
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: 0.85,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    AVERAGE: 0.4,
};

// OEECalculator class handles the calculation and management of OEE metrics
/**
 * Class representing an OEE Calculator.
 * @class
 */
class OEECalculator {
    constructor() {
        this.oeeData = {}; // Initialize as an empty object
    }

    // Reset OEE data to default values
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
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0,
        };
    }

    // Initialize OEE data with process order data
    async init() {
        try {
            const processOrderData = await loadProcessOrderData();
            oeeLogger.info(`Loaded process order data: ${JSON.stringify(processOrderData)}`);
            this.validateProcessOrderData(processOrderData); // Validate the data
            this.setOEEData(processOrderData[0], 'default'); // Set the OEE data for default line
        } catch (error) {
            errorLogger.error(`Error initializing OEECalculator: ${error.message}`);
            throw error;
        }
    }

    // Validate the process order data
    validateProcessOrderData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('Process order data is null or undefined');
        }

        const { ProcessOrderNumber, setupTime, processingTime, teardownTime, totalPartsToBeProduced, Start, End, MaterialNumber, MaterialDescription } = data[0];
        if (!ProcessOrderNumber || setupTime == null || processingTime == null || teardownTime == null || totalPartsToBeProduced == null || Start == null || End == null || MaterialNumber == null || MaterialDescription == null) {
            throw new Error('Invalid process order data: One or more required fields are missing.');
        }
    }

    // Set OEE data with validated process order data
    setOEEData(data, line) {
        if (!this.oeeData[line]) {
            this.oeeData[line] = this.resetOEEData();
        }

        const { ProcessOrderNumber, setupTime, processingTime, teardownTime, totalPartsToBeProduced, Start, End, MaterialNumber, MaterialDescription } = data;
        this.oeeData[line].ProcessOrderNumber = ProcessOrderNumber;
        this.oeeData[line].plannedProduction = setupTime + processingTime + teardownTime;
        this.oeeData[line].runtime = setupTime + processingTime + teardownTime;
        this.oeeData[line].targetPerformance = totalPartsToBeProduced;
        this.oeeData[line].StartTime = Start;
        this.oeeData[line].EndTime = End;
        this.oeeData[line].MaterialNumber = MaterialNumber;
        this.oeeData[line].MaterialDescription = MaterialDescription;
    }

    // Update specific OEE metric
    updateData(metric, value, line) {
        oeeLogger.debug(`Updating ${metric} with value: ${value} for line: ${line}`);
        if (!this.oeeData[line]) {
            this.oeeData[line] = this.resetOEEData(); // Initialize line data if not exists
        }
        this.oeeData[line][metric] = value;
    }

    // Validate input OEE data before calculation
    validateInput(line) {
        const { plannedProduction, runtime, actualPerformance, targetPerformance, goodProducts, totalProduction } = this.oeeData[line];
        oeeLogger.debug(`Validating input data for line ${line}: ${JSON.stringify(this.oeeData[line])}`);

        if (runtime <= 0) throw new Error('Invalid input data: runtime must be greater than 0');
        if (plannedProduction <= 0) throw new Error('Invalid input data: plannedProduction must be greater than 0');
        if (totalProduction < 0) throw new Error('Invalid input data: totalProduction must be non-negative');
        if (targetPerformance < 0) throw new Error('Invalid input data: targetPerformance must be non-negative');
        if (goodProducts < 0) throw new Error('Invalid input data: goodProducts must be non-negative');
        if (totalProduction > targetPerformance) throw new Error('Invalid input data: totalProduction cannot be greater than targetPerformance');
        if (goodProducts > totalProduction) throw new Error('Invalid input data: goodProducts cannot be greater than totalProduction');
    }

    // Calculate OEE metrics
    async calculateMetrics(line, totalUnplannedDowntime, totalPlannedDowntime) {
        if (!this.oeeData[line]) {
            throw new Error(`No data found for line: ${line}`);
        }

        this.validateInput(line);

        const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, ProcessOrderNumber, StartTime, EndTime, MaterialNumber, MaterialDescription } = this.oeeData[line];
        oeeLogger.info(`Calculating metrics for ProcessOrderNumber: ${ProcessOrderNumber} on line: ${line}`);

        try {
            const OEEData = loadDataAndPrepareOEE();

            const totalProductionTime = OEEData.datasets[0].data.reduce((a, b) => a + b, 0);
            const totalBreakTime = OEEData.datasets[1].data.reduce((a, b) => a + b, 0);
            const actualUnplannedDowntime = totalUnplannedDowntime || OEEData.datasets[2].data.reduce((a, b) => a + b, 0);
            const actualPlannedDowntime = totalPlannedDowntime || OEEData.datasets[3].data.reduce((a, b) => a + b, 0);

            oeeLogger.info(`Total production time: ${totalProductionTime}`);
            oeeLogger.info(`Total break time: ${totalBreakTime}`);
            oeeLogger.info(`Total unplanned downtime: ${actualUnplannedDowntime}`);
            oeeLogger.info(`Total planned downtime: ${actualPlannedDowntime}`);

            // Log input values
            oeeLogger.info(`Input values for line ${line} - plannedProduction: ${plannedProduction}, runtime: ${runtime}, targetPerformance: ${targetPerformance}, goodProducts: ${goodProducts}, totalProduction: ${totalProduction}, MaterialNumber: ${MaterialNumber}, MaterialDescription: ${MaterialDescription}`);

            // Perform OEE calculation
            this.calculateOEE(plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, actualUnplannedDowntime, actualPlannedDowntime, line);

            // Log calculated OEE data
            oeeLogger.info(`Calculated OEE data for line ${line}: ${JSON.stringify(this.oeeData[line])}`);
        } catch (error) {
            errorLogger.error(`Error calculating metrics for line ${line}: ${error.message}`);
            throw error;
        }
    }

    // Calculate OEE and its components: availability, performance, and quality
    calculateOEE(plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, actualUnplannedDowntime, actualPlannedDowntime, line) {
        const operatingTime = runtime - (actualUnplannedDowntime / 60) - (actualPlannedDowntime / 60);

        this.oeeData[line].availability = operatingTime / plannedProduction;
        this.oeeData[line].performance = targetPerformance > 0 ? totalProduction / targetPerformance : 0;
        this.oeeData[line].quality = totalProduction > 0 ? goodProducts / totalProduction : 0;
        this.oeeData[line].oee = this.oeeData[line].availability * this.oeeData[line].performance * this.oeeData[line].quality * 100;

        if (!isFinite(this.oeeData[line].oee)) {
            throw new Error(`Calculated OEE is not finite: ${this.oeeData[line].oee}`);
        }

        this.oeeData[line].classification = this.classifyOEE(this.oeeData[line].oee / 100);
    }

    // Classify OEE based on predefined levels
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

    // Get calculated OEE metrics
    getMetrics(line) {
        return this.oeeData[line];
    }
}

let writeApi = null;

// Initialize InfluxDB write API
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

// Function to write OEE metrics to InfluxDB
async function writeOEEToInfluxDB(metrics) {
    if (!writeApi) {
        errorLogger.error('InfluxDB write API is not initialized.');
        return;
    }

    try {
        const point = new Point('oee')
            .tag('plant', metrics.processData.group_id)
            .tag('area', 'Packaging')
            .tag('line', metrics.processData.edge_node_id);

        // Add all additional tags from metrics.processData
        Object.keys(metrics.processData).forEach(key => {
            if (typeof metrics.processData[key] !== 'object') {
                point.tag(key, metrics.processData[key]);
            }
        });

        // Add fields
        point
            .floatField('oee', oeeAsPercent ? metrics.oee : metrics.oee / 100)
            .floatField('availability', oeeAsPercent ? metrics.availability * 100 : metrics.availability)
            .floatField('performance', oeeAsPercent ? metrics.performance * 100 : metrics.performance)
            .floatField('quality', oeeAsPercent ? metrics.quality * 100 : metrics.quality)
            .floatField('plannedProduction', metrics.processData.plannedProduction)
            .floatField('plannedDowntime', metrics.processData.plannedDowntime)
            .floatField('unplannedDowntime', metrics.processData.unplannedDowntime);

        writeApi.writePoint(point);
        await writeApi.flush();
    } catch (error) {
        errorLogger.error(`Error writing to InfluxDB: ${error.message}`);
    }
}

module.exports = { OEECalculator, writeOEEToInfluxDB };