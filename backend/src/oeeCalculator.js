const axios = require("axios");
const { oeeLogger, errorLogger } = require("../utils/logger");
const dotenv = require("dotenv");
const moment = require("moment");

dotenv.config();

const OEE_API_URL = process.env.OEE_API_URL || "http://localhost:3000/api/v1";
const CLASSIFICATION_LEVELS = {
  WORLD_CLASS: 0.85,
  EXCELLENT: 0.7,
  GOOD: 0.6,
  AVERAGE: 0.4,
};

const cache = {}; // Cache-Objekt zur Speicherung der Daten
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten in Millisekunden

async function fetchOEEDataFromAPI(machineId) {
  const cacheKey = `OEEData_${machineId}`;

  if (
    cache[cacheKey] &&
    Date.now() - cache[cacheKey].timestamp < CACHE_DURATION
  ) {
    return cache[cacheKey].data;
  }

  try {
    const response = await axios.get(
      `${OEE_API_URL}/prepareOEE/oee/${machineId}`
    );
    const data = response.data;

    cache[cacheKey] = {
      data,
      timestamp: Date.now(),
    };

    return data;
  } catch (error) {
    errorLogger.error(
      `Failed to fetch OEE data from API for machineId ${machineId}: ${error.message}`
    );
    throw new Error("Could not fetch OEE data from API");
  }
}

class OEECalculator {
  constructor() {
    this.oeeData = {};
  }

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

  async init(machineId) {
    try {
      oeeLogger.info(`Initializing OEECalculator for machineId ${machineId}`);

      const OEEData = await fetchOEEDataFromAPI(machineId);
      console.log("Fetched OEE Data:", OEEData);
      if (OEEData) {
        this.setOEEData(OEEData, machineId);
      } else {
        oeeLogger.warn(`No OEE data found for machineId ${machineId}`);
      }
    } catch (error) {
      errorLogger.error(
        `Error initializing OEECalculator for machineId ${machineId}: ${error.message}`
      );
      throw error;
    }
  }

  setOEEData(OEEData, machineId) {
    console.log("Data received:", OEEData);
    const processOrder = OEEData.processOrder;

    if (!processOrder.Start || !processOrder.End) {
      console.error("One or more required time fields are missing:", {
        Start: processOrder.Start,
        End: processOrder.End,
        ActualProcessOrderStart: processOrder.ActualProcessOrderStart,
        ActualProcessOrderEnd: processOrder.ActualProcessOrderEnd,
      });
      throw new Error("Required time fields are missing in the data");
    }

    const plannedStart = moment(processOrder.Start);
    const plannedEnd = moment(processOrder.End);

    let plannedTakt;
    let actualTakt;
    let remainingTime;
    let expectedEndTime;

    if (
      !processOrder.ActualProcessOrderStart &&
      !processOrder.ActualProcessOrderEnd
    ) {
      const plannedDurationMinutes = plannedEnd.diff(plannedStart, "minutes");
      plannedTakt =
        plannedDurationMinutes / processOrder.plannedProductionQuantity;
      actualTakt = plannedTakt;
      remainingTime = processOrder.plannedProductionQuantity * actualTakt;
      expectedEndTime = plannedStart.add(remainingTime, "minutes");
    } else if (
      processOrder.ActualProcessOrderStart &&
      !processOrder.ActualProcessOrderEnd
    ) {
      const actualStart = moment(processOrder.ActualProcessOrderStart);
      const plannedDurationMinutes = plannedEnd.diff(actualStart, "minutes");
      plannedTakt =
        plannedDurationMinutes / processOrder.plannedProductionQuantity;
      actualTakt = plannedTakt;
      remainingTime =
        (processOrder.plannedProductionQuantity -
          processOrder.totalProductionQuantity) *
        actualTakt;
      expectedEndTime = actualStart.add(remainingTime, "minutes");
    } else if (
      processOrder.ActualProcessOrderStart &&
      processOrder.ActualProcessOrderEnd
    ) {
      const actualStart = moment(processOrder.ActualProcessOrderStart);
      const actualEnd = moment(processOrder.ActualProcessOrderEnd);
      const actualDurationMinutes = actualEnd.diff(actualStart, "minutes");
      plannedTakt =
        plannedEnd.diff(plannedStart, "minutes") /
        processOrder.plannedProductionQuantity;
      actualTakt =
        actualDurationMinutes / processOrder.plannedProductionQuantity;
      remainingTime =
        (processOrder.plannedProductionQuantity -
          processOrder.totalProductionQuantity) *
        actualTakt;
      expectedEndTime = actualEnd.add(remainingTime, "minutes");
    }

    console.log("Planned Takt:", plannedTakt);
    console.log("Actual Takt:", actualTakt);
    console.log(
      "Expected End Time:",
      expectedEndTime
        ? expectedEndTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ")
        : "N/A"
    );

    this.oeeData[machineId] = {
      ...this.resetOEEData(),
      ...processOrder,
      runtime:
        processOrder.setupTime +
        processOrder.processingTime +
        processOrder.teardownTime,
      plannedTakt,
      actualTakt,
      expectedEndTime: expectedEndTime
        ? expectedEndTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ")
        : null,
    };

    console.log("OEE Data:", this.oeeData[machineId]);
  }

  async calculateMetrics(
    machineId,
    totalUnplannedDowntime,
    totalPlannedDowntime,
    plannedProductionQuantity,
    processOrder
  ) {
    console.log("Debugging calculateMetrics:");
    console.log("machineId:", machineId);
    console.log("totalUnplannedDowntime:", totalUnplannedDowntime);
    console.log("totalPlannedDowntime:", totalPlannedDowntime);
    console.log("plannedProductionQuantity:", plannedProductionQuantity);
    console.log("processOrder:", processOrder);

    if (!this.oeeData[machineId]) {
      throw new Error(`No data found for machineId: ${machineId}`);
    }

    const {
      ActualProcessOrderStart,
      ActualProcessOrderEnd,
      setupTime,
      teardownTime,
      MaterialDescription,
      Start,
      End,
    } = processOrder;

    if (!ActualProcessOrderStart && !Start) {
      console.error(
        "Error: At least ActualProcessOrderStart or Start is required"
      );
      throw new Error("At least ActualProcessOrderStart or Start is required");
    }

    let actualDurationMinutes;
    let expectedEndTime;
    let plannedTakt;
    let actualTakt;

    // Case 1: Neither ActualProcessOrderStart nor ActualProcessOrderEnd are present
    if (!ActualProcessOrderStart && !ActualProcessOrderEnd) {
      const plannedStart = moment(Start);
      const plannedEnd = moment(End);
      const plannedDurationMinutes = plannedEnd.diff(plannedStart, "minutes");

      plannedTakt =
        plannedDurationMinutes / processOrder.plannedProductionQuantity;
      actualTakt = plannedTakt;
      actualDurationMinutes = plannedDurationMinutes;
      expectedEndTime = plannedEnd;
    }
    // Case 2: ActualProcessOrderStart is present but ActualProcessOrderEnd is missing
    else if (ActualProcessOrderStart && !ActualProcessOrderEnd) {
      const actualStart = moment(ActualProcessOrderStart);
      const plannedEnd = moment(End);
      const plannedDurationMinutes = plannedEnd.diff(actualStart, "minutes");

      plannedTakt =
        plannedDurationMinutes / processOrder.plannedProductionQuantity;
      actualTakt = plannedTakt;
      actualDurationMinutes = moment().diff(actualStart, "minutes");
      expectedEndTime = plannedEnd;
    }
    // Case 3: Both ActualProcessOrderStart and ActualProcessOrderEnd are present
    else if (ActualProcessOrderStart && ActualProcessOrderEnd) {
      const actualStart = moment(ActualProcessOrderStart);
      const actualEnd = moment(ActualProcessOrderEnd);
      actualDurationMinutes = actualEnd.diff(actualStart, "minutes");

      plannedTakt =
        moment(End).diff(moment(Start), "minutes") /
        processOrder.plannedProductionQuantity;
      actualTakt =
        actualDurationMinutes / processOrder.plannedProductionQuantity;
      expectedEndTime = actualEnd;
    }

    console.log("Planned Takt:", plannedTakt);
    console.log("Actual Takt:", actualTakt);
    console.log(
      "Expected End Time:",
      expectedEndTime
        ? expectedEndTime.format("YYYY-MM-DDTHH:mm:ss.SSSZ")
        : "N/A"
    );

    this.validateInput(machineId);

    const {
      runtime,
      targetPerformance,
      totalProductionYield,
      totalProductionQuantity,
    } = this.oeeData[machineId];

    try {
      const OEEData = await fetchOEEDataFromAPI(machineId);

      if (!OEEData || !Array.isArray(OEEData.datasets)) {
        throw new Error(
          "Invalid OEEData returned from API. Expected an object with a datasets array."
        );
      }

      const totalProductionQuantityTime = OEEData.datasets[0].data.reduce(
        (a, b) => a + b,
        0
      );
      const actualUnplannedDowntime =
        totalUnplannedDowntime ||
        OEEData.datasets[2].data.reduce((a, b) => a + b, 0);
      const actualPlannedDowntime =
        totalPlannedDowntime ||
        OEEData.datasets[3].data.reduce((a, b) => a + b, 0);
      const actualMicroStops =
        totalMicroStops || OEEData.datasets[4].data.reduce((a, b) => a + b, 0);

      const availability =
        (runtime - actualUnplannedDowntime - actualPlannedDowntime) / runtime;
      const performance = totalProductionQuantityTime / targetPerformance;
      const quality = totalProductionYield / totalProductionQuantity;
      const oee = availability * performance * quality;

      this.oeeData[machineId] = {
        ...this.oeeData[machineId],
        availability,
        performance,
        quality,
        oee,
        actualDurationMinutes,
        setupTime,
        teardownTime,
        MaterialDescription,
        expectedEndTime: moment(expectedEndTime).format(
          "YYYY-MM-DDTHH:mm:ss.SSSZ"
        ),
      };

      oeeLogger.info(
        `Calculated metrics for machineId ${machineId}: ${JSON.stringify(
          this.oeeData[machineId]
        )}`
      );
    } catch (error) {
      errorLogger.warn(
        `Error calculating metrics for machineId ${machineId}: ${error.message}`
      );
      throw error;
    }
  }

  classifyOEE(machineId) {
    let oee;
    if (this.oeeData[machineId]) {
      oee = this.oeeData[machineId].oee;
    } else {
      oee = undefined;
    }

    if (oee === undefined) {
      throw new Error(`OEE not calculated for machineId: ${machineId}`);
    }

    if (oee >= CLASSIFICATION_LEVELS.WORLD_CLASS) return "World-Class";
    if (oee >= CLASSIFICATION_LEVELS.EXCELLENT) return "Excellent";
    if (oee >= CLASSIFICATION_LEVELS.GOOD) return "Good";
    if (oee >= CLASSIFICATION_LEVELS.AVERAGE) return "Average";
    return "Below Average";
  }

  getMetrics(machineId) {
    if (!this.oeeData[machineId]) {
      throw new Error(`No metrics available for machineId: ${machineId}`);
    }
    return this.oeeData[machineId];
  }
}

module.exports = OEECalculator;
