const axios = require("axios");
const { oeeLogger, errorLogger } = require("../utils/logger");
const config = require("../config/config.json");
const dotenv = require("dotenv");
const moment = require("moment");

dotenv.config();

// Constants
const OEE_API_URL = process.env.OEE_API_URL || config.oeeApiUrl;

// Classification levels for OEE metrics
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: config.classificationLevels.WORLD_CLASS,
    EXCELLENT: config.classificationLevels.EXCELLENT,
    GOOD: config.classificationLevels.GOOD,
    AVERAGE: config.classificationLevels.AVERAGE,
};

// =====================
// Fetch OEE Data from API
// =====================
async function fetchOEEDataFromAPI(machineId) {
    try {
        const response = await axios.get(`${OEE_API_URL}/prepareOEE/oee/${machineId}`);
        return response.data;
    } catch (error) {
        errorLogger.error(`Failed to fetch OEE data from API for machineId ${machineId}: ${error.message}`);
        throw new Error("Could not fetch OEE data from API");
    }
}

// =====================
// OEE Calculator Class
// =====================
class OEECalculator {
    constructor() {
        this.oeeData = {};
    }

    // Reset OEE Data structure for initialization
    resetOEEData() {
        return {
            ProcessOrderNumber: null,
            MaterialNumber: null,
            MaterialDescription: null,
            plannedProductionQuantity: 0,
            runtime: 0,
            actualPerformance: 0,
            targetPerformance: 0,
            totalProductionYield: 0,
            totalProductionQuantity: 0,
            unplannedDowntime: 0,
            setupTime: 0,
            processingTime: 0,
            teardownTime: 0,
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0,
            StartTime: null,
            EndTime: null,
            plannedTakt: 0,
            actualTakt: 0,
            expectedEndTime: null,
        };
    }

    // Initialize OEE Data for a machine by fetching it from the API
    async init(machineId) {
        try {
            oeeLogger.info(`Initializing OEECalculator for machineId ${machineId}`);
            const OEEData = await fetchOEEDataFromAPI(machineId);
            if (OEEData) {
                this.setOEEData(OEEData, machineId);
            } else {
                oeeLogger.warn(`No OEE data found for machineId ${machineId}`);
            }
        } catch (error) {
            errorLogger.error(`Error initializing OEECalculator for machineId ${machineId}: ${error.message}`);
            throw error;
        }
    }

    // Set the OEE Data for a specific machine
    setOEEData(OEEData, machineId) {
        const processOrder = OEEData.processOrder;

        if (!processOrder.Start || !processOrder.End) {
            throw new Error("Required time fields (Start/End) are missing in the data");
        }

        const plannedStart = moment(processOrder.Start);
        const plannedEnd = moment(processOrder.End);
        let plannedTakt, actualTakt, remainingTime, expectedEndTime;

        if (!processOrder.ActualProcessOrderStart && !processOrder.ActualProcessOrderEnd) {
            const plannedDurationMinutes = plannedEnd.diff(plannedStart, "minutes");
            plannedTakt = plannedDurationMinutes / processOrder.plannedProductionQuantity;
            actualTakt = plannedTakt;
            remainingTime = processOrder.plannedProductionQuantity * actualTakt;
            expectedEndTime = plannedStart.add(remainingTime, "minutes");
        } else if (processOrder.ActualProcessOrderStart && !processOrder.ActualProcessOrderEnd) {
            const actualStart = moment(processOrder.ActualProcessOrderStart);
            const plannedDurationMinutes = plannedEnd.diff(actualStart, "minutes");
            plannedTakt = plannedDurationMinutes / processOrder.plannedProductionQuantity;
            actualTakt = plannedTakt;
            remainingTime = (processOrder.plannedProductionQuantity - processOrder.totalProductionQuantity) * actualTakt;
            expectedEndTime = plannedEnd;
        } else if (processOrder.ActualProcessOrderStart && processOrder.ActualProcessOrderEnd) {
            const actualStart = moment(processOrder.ActualProcessOrderStart);
            const actualEnd = moment(processOrder.ActualProcessOrderEnd);
            const actualDurationMinutes = actualEnd.diff(actualStart, "minutes");
            plannedTakt = plannedEnd.diff(plannedStart, "minutes") / processOrder.plannedProductionQuantity;
            actualTakt = actualDurationMinutes / processOrder.plannedProductionQuantity;
            remainingTime = (processOrder.plannedProductionQuantity - processOrder.totalProductionQuantity) * actualTakt;
            expectedEndTime = actualEnd.add(remainingTime, "minutes");
        }

        this.oeeData[machineId] = {
            ...this.resetOEEData(),
            ...processOrder,
            StartTime: processOrder.ActualProcessOrderStart || processOrder.Start,
            EndTime: processOrder.ActualProcessOrderEnd || processOrder.End,
            runtime: processOrder.setupTime + processOrder.processingTime + processOrder.teardownTime,
            plannedTakt,
            actualTakt,
            remainingTime,
            expectedEndTime: expectedEndTime ? expectedEndTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ") : null,
        };
    }

    // Calculate OEE Metrics
    async calculateMetrics(machineId, totalUnplannedDowntime, totalPlannedDowntime, ProductionQuantity, ProductionYield, processOrder) {
        if (!this.oeeData[machineId]) {
            throw new Error(`No data found for machineId: ${machineId}`);
        }

        const {
            ActualProcessOrderStart,
            ActualProcessOrderEnd,
            plannedProductionQuantity,
            Start,
            End,
            setupTime,
            processingTime,
            teardownTime,
            totalProductionQuantity,
        } = processOrder;

        if (!ActualProcessOrderStart && !Start) {
            throw new Error("At least ActualProcessOrderStart or Start is required");
        }

        const plannedStart = moment(Start);
        const plannedEnd = moment(End);
        const actualStart = moment(ActualProcessOrderStart || Start);
        const actualEnd = ActualProcessOrderEnd ? moment(ActualProcessOrderEnd) : null;

        const plannedDurationMinutes = plannedEnd.diff(plannedStart, "minutes");
        let plannedTakt, actualTakt, remainingTime, expectedEndTime;

        if (actualEnd) {
            const actualDurationMinutes = actualEnd.diff(actualStart, "minutes");
            plannedTakt = plannedDurationMinutes / plannedProductionQuantity;
            actualTakt = actualDurationMinutes / ProductionQuantity;
            remainingTime = (plannedProductionQuantity - ProductionQuantity) * actualTakt;
            expectedEndTime = actualEnd.add(remainingTime, "minutes");
        } else {
            plannedTakt = plannedDurationMinutes / plannedProductionQuantity;
            actualTakt = ProductionQuantity > 0 ? plannedDurationMinutes / ProductionQuantity : null;
            remainingTime = (plannedProductionQuantity - ProductionQuantity) * (actualTakt || plannedTakt);
            expectedEndTime = actualStart.add(remainingTime, "minutes");
        }

        const scrap = totalProductionQuantity - ProductionYield;

        this.oeeData[machineId] = {
            ...this.oeeData[machineId],
            ...processOrder,
            StartTime: processOrder.ActualProcessOrderStart || processOrder.Start,
            EndTime: processOrder.ActualProcessOrderEnd || processOrder.End,
            runtime: setupTime + processingTime + teardownTime,
            ProductionQuantity,
            totalUnplannedDowntime,
            ProductionYield,
            plannedDurationMinutes,
            plannedTakt,
            actualTakt,
            remainingTime,
            expectedEndTime: expectedEndTime ? expectedEndTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ") : null,
            scrap,
        };

        const availability = ((this.oeeData[machineId].runtime - totalUnplannedDowntime) / this.oeeData[machineId].runtime) * 100;
        const performance = actualTakt ? (plannedTakt / actualTakt) * 100 : 0;
        const quality = (ProductionYield / totalProductionQuantity) * 100;
        const oee = (availability * performance * quality) / 10000;

        this.oeeData[machineId] = {
            ...this.oeeData[machineId],
            availability,
            performance,
            quality,
            oee,
            actualDurationMinutes: actualEnd ? actualEnd.diff(actualStart, "minutes") : null,
            setupTime,
            teardownTime,
        };

        const classification = this.classifyOEE(machineId);
        this.oeeData[machineId].classification = classification;

        console.log(`OEE Classification for machine ${machineId}: ${classification}`);
    }

    // Classify OEE based on predefined levels
    classifyOEE(machineId) {
        const oee = (this.oeeData[machineId] && this.oeeData[machineId].oee) || undefined;

        if (oee === undefined) {
            throw new Error(`OEE not calculated for machineId: ${machineId}`);
        }

        if (oee >= CLASSIFICATION_LEVELS.WORLD_CLASS) return "World-Class";
        if (oee >= CLASSIFICATION_LEVELS.EXCELLENT) return "Excellent";
        if (oee >= CLASSIFICATION_LEVELS.GOOD) return "Good";
        if (oee >= CLASSIFICATION_LEVELS.AVERAGE) return "Average";
        return "Below Average";
    }

    // Retrieve calculated metrics for a machine
    getMetrics(machineId) {
        if (!this.oeeData[machineId]) {
            throw new Error(`No metrics available for machineId: ${machineId}`);
        }
        return this.oeeData[machineId];
    }
}

module.exports = OEECalculator;