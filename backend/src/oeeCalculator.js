const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { oeeLogger, errorLogger, defaultLogger } = require('../utils/logger');
const { influxdb, oeeAsPercent } = require('../config/config');
const { loadDataAndPrepareOEE } = require('../src/downtimeManager');
const { loadProcessOrderData } = require('../src/dataLoader');

// Constants for OEE classification thresholds
const VALID_SCORE_THRESHOLD = 1.0;
const MINIMUM_SCORE_THRESHOLD = 0.0;
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: 0.85,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    AVERAGE: 0.4,
};

// The OEECalculator class manages the calculation and storage of OEE metrics for different machines
class OEECalculator {
    constructor() {
        this.oeeData = {}; // Initialize an empty object to store OEE data for different machines
    }

    // Reset OEE data to default values for a specific machine
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

    // Initialize OEE data with process order data for a specific machine
    async init(machineId) {
        try {
            oeeLogger.debug(`Initializing OEECalculator for machineId ${machineId}`);
            const processOrderData = await loadProcessOrderData(machineId);
            if (processOrderData.length === 0) {
                throw new Error(`No active process order found for machineId ${machineId}.`);
            }
            oeeLogger.debug(`Process Order Data: ${JSON.stringify(processOrderData[0])}`);

            this.validateProcessOrderData(processOrderData); // Validate the process order data
            this.setOEEData(processOrderData[0], machineId); // Set OEE data for the specific machineId
        } catch (error) {
            errorLogger.error(`Error initializing OEECalculator for machineId ${machineId}: ${error.message}`);
            throw error;
        }
    }

    // Validate the process order data to ensure it contains the necessary fields
    validateProcessOrderData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('Process order data is null or undefined');
        }

        const { ProcessOrderNumber, setupTime, processingTime, teardownTime, totalPartsToBeProduced, Start, End, MaterialNumber, MaterialDescription } = data[0];
        if (!ProcessOrderNumber || setupTime == null || processingTime == null || teardownTime == null || totalPartsToBeProduced == null || Start == null || End == null || MaterialNumber == null || MaterialDescription == null) {
            throw new Error('Invalid process order data: One or more required fields are missing.');
        }
    }

    // Set OEE data for a specific machine with validated process order data
    setOEEData(data, machineId) {
        if (!this.oeeData[machineId]) {
            this.oeeData[machineId] = this.resetOEEData();
        }

        const { ProcessOrderNumber, setupTime, processingTime, teardownTime, totalPartsToBeProduced, Start, End, MaterialNumber, MaterialDescription } = data;

        // Log the data being set
        oeeLogger.debug(`Setting OEE Data for machineId ${machineId}: ProcessOrderNumber=${ProcessOrderNumber}, MaterialNumber=${MaterialNumber}, MaterialDescription=${MaterialDescription}`);

        this.oeeData[machineId].ProcessOrderNumber = ProcessOrderNumber || 'UnknownOrder';
        this.oeeData[machineId].plannedProduction = setupTime + processingTime + teardownTime;
        this.oeeData[machineId].runtime = setupTime + processingTime + teardownTime;
        this.oeeData[machineId].targetPerformance = totalPartsToBeProduced;
        this.oeeData[machineId].StartTime = Start;
        this.oeeData[machineId].EndTime = End;
        this.oeeData[machineId].MaterialNumber = MaterialNumber || 'UnknownMaterial';
        this.oeeData[machineId].MaterialDescription = MaterialDescription || 'No Description';
    }

    // Update a specific OEE metric for a machine
    updateData(metric, value, machineId) {
        oeeLogger.debug(`Updating ${metric} with value: ${value} for machineId: ${machineId}`);
        if (!this.oeeData[machineId]) {
            this.oeeData[machineId] = this.resetOEEData(); // Initialize machineId data if not exists
        }
        this.oeeData[machineId][metric] = value;
    }

    // Validate the OEE data before performing calculations
    validateInput(machineId) {
        const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction } = this.oeeData[machineId];

        if (runtime <= 0) throw new Error('Invalid input data: runtime must be greater than 0');
        if (plannedProduction <= 0) throw new Error('Invalid input data:plannedProduction must be greater than 0');
        if (totalProduction < 0) throw new Error('Invalid input data: totalProduction must be non-negative');
        if (targetPerformance < 0) throw new Error('Invalid input data: targetPerformance must be non-negative');
        if (goodProducts < 0) throw new Error('Invalid input data: goodProducts must be non-negative');
        if (totalProduction > targetPerformance) throw new Error('Invalid input data: totalProduction cannot be greater than targetPerformance');
        if (goodProducts > totalProduction) throw new Error('Invalid input data: goodProducts cannot be greater than totalProduction');
    }

    // Calculate OEE metrics based on input data
    async calculateMetrics(machineId, totalUnplannedDowntime, totalPlannedDowntime) {
        if (!this.oeeData[machineId]) {
            throw new Error(`No data found for machineId: ${machineId}`);
        }

        this.validateInput(machineId);

        const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, ProcessOrderNumber, StartTime, EndTime, MaterialNumber, MaterialDescription } = this.oeeData[machineId];
        oeeLogger.info(`Calculating metrics for ProcessOrderNumber: ${ProcessOrderNumber} on machineId: ${machineId}`);

        try {
            // Load and prepare OEE data for calculations
            const OEEData = loadDataAndPrepareOEE(machineId);

            if (!OEEData || !Array.isArray(OEEData.datasets)) {
                throw new Error('Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array.');
            }

            // Calculate various times from the datasets
            const totalProductionTime = OEEData.datasets[0].data.reduce((a, b) => a + b, 0);
            const totalBreakTime = OEEData.datasets[1].data.reduce((a, b) => a + b, 0);
            const actualUnplannedDowntime = totalUnplannedDowntime || OEEData.datasets[2].data.reduce((a, b) => a + b, 0);
            const actualPlannedDowntime = totalPlannedDowntime || OEEData.datasets[3].data.reduce((a, b) => a + b, 0);

            oeeLogger.debug(`Total production time: ${totalProductionTime}`);
            oeeLogger.debug(`Total break time: ${totalBreakTime}`);
            oeeLogger.debug(`Total unplanned downtime: ${actualUnplannedDowntime}`);
            oeeLogger.debug(`Total planned downtime: ${actualPlannedDowntime}`);

            // Log input values
            oeeLogger.info(`Input values for machineId ${machineId} -plannedProduction: ${plannedProduction}, runtime: ${runtime}, targetPerformance: ${targetPerformance}, goodProducts: ${goodProducts}, totalProduction: ${totalProduction}, MaterialNumber: ${MaterialNumber}, MaterialDescription: ${MaterialDescription}`);

            // Perform the OEE calculation
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

            // Log the calculated OEE data
            oeeLogger.debug(`Calculated OEE data for machineId ${machineId}: ${JSON.stringify(this.oeeData[machineId])}`);
        } catch (error) {
            errorLogger.warn(`Warning calculating metrics for machineId ${machineId}: ${error.message}`);
            throw error;
        }
    }

    // Calculate the OEE and its components: availability, performance, and quality
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

        // Classify the OEE score
        this.oeeData[machineId].classification = this.classifyOEE(this.oeeData[machineId].oee / 100);
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

    // Get calculated OEE metrics for a specific machine
    getMetrics(machineId) {
        return this.oeeData[machineId];
    }
}

let writeApi = null;

// Initialize the InfluxDB write API
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
        const point = new Point('oee_metrics')
            .tag('plant', metrics.processData.plant || 'UnknownPlant') // Tag for the plant
            .tag('area', metrics.processData.area || 'UnknownArea') // Tag for the area
            .tag('machineId', metrics.processData.machineId || 'UnknownMachine') // Tag for the machine ID
            .tag('ProcessOrderNumber', metrics.processData.ProcessOrderNumber || 'UnknownOrder') // Tag for the process order
            .tag('MaterialNumber', metrics.processData.MaterialNumber || 'UnknownMaterial') // Tag for the material number
            .tag('MaterialDescription', metrics.processData.MaterialDescription || 'No Description'); // Tag for the material description

        // Fields for OEE and its components
        point
            .floatField('oee', oeeAsPercent ? metrics.oee : metrics.oee / 100)
            .floatField('availability', oeeAsPercent ? metrics.availability * 100 : metrics.availability)
            .floatField('performance', oeeAsPercent ? metrics.performance * 100 : metrics.performance)
            .floatField('quality', oeeAsPercent ? metrics.quality * 100 : metrics.quality)
            .floatField('plannedProduction', metrics.processData.plannedProduction)
            .floatField('plannedDowntime', metrics.processData.plannedDowntime)
            .floatField('unplannedDowntime', metrics.processData.unplannedDowntime)
            .floatField('microstops', metrics.processData.microstops); // Fields for downtimes and microstops

        // Write the data point to InfluxDB
        writeApi.writePoint(point);
        await writeApi.flush();

        // Log successful write operation
        defaultLogger.info(`Successfully wrote OEE metrics for machine ID: ${metrics.processData.machineId || 'undefined'} to InfluxDB.`);
    } catch (error) {
        errorLogger.error(`Error writing to InfluxDB: ${error.message}`);
    }
}

module.exports = { OEECalculator, writeOEEToInfluxDB };