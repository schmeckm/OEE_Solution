// oeeCalculator.js
const axios = require("axios");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { oeeApiUrl } = require("../config/config");
const { loadDataAndPrepareOEE } = require("../src/downtimeManager");

const CLASSIFICATION_LEVELS = {
  WORLD_CLASS: 0.85,
  EXCELLENT: 0.7,
  GOOD: 0.6,
  AVERAGE: 0.4,
};

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
    };
  }

  async init(machineId) {
    try {
      oeeLogger.info(`Initializing OEECalculator for machineId ${machineId}`);

      const apiEndpoint = `${oeeApiUrl}/processorders/rel?machineId=${machineId}&mark=true`;
      const processOrderData = await this.fetchData(apiEndpoint);

      if (processOrderData.length > 0) {
        this.setOEEData(processOrderData[0], machineId);
      }
    } catch (error) {
      errorLogger.error(
        `Error initializing OEECalculator for machineId ${machineId}: ${error.message}`
      );
      throw error;
    }
  }

  async fetchData(url) {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      errorLogger.error(`Failed to fetch data from ${url}: ${error.message}`);
      throw new Error(`Failed to fetch data from ${url}`);
    }
  }

  setOEEData(data, machineId) {
    this.oeeData[machineId] = {
      ...this.resetOEEData(),
      ...data,
      runtime: data.setupTime + data.processingTime + data.teardownTime,
    };
  }

  updateData(metric, value, machineId) {
    oeeLogger.debug(
      `Updating ${metric} with value: ${value} for machineId: ${machineId}`
    );
    if (!this.oeeData[machineId]) {
      this.oeeData[machineId] = this.resetOEEData();
    }
    this.oeeData[machineId][metric] = value;
  }

  validateInput(machineId) {
    const {
      plannedProductionQuantity,
      runtime,
      totalProductionQuantity,
      totalProductionYield,
      targetPerformance,
    } = this.oeeData[machineId];

    const errors = [];
    if (runtime <= 0) errors.push("runtime must be greater than 0");
    if (plannedProductionQuantity <= 0)
      errors.push("plannedProductionQuantity must be greater than 0");
    if (totalProductionQuantity < 0)
      errors.push("totalProductionQuantity must be non-negative");
    if (totalProductionYield < 0)
      errors.push("totalProductionYield must be non-negative");
    if (totalProductionQuantity > targetPerformance)
      errors.push(
        "totalProductionQuantity cannot be greater than targetPerformance"
      );
    if (totalProductionYield > totalProductionQuantity)
      errors.push(
        "totalProductionYield cannot be greater than totalProductionQuantity"
      );

    if (errors.length > 0) {
      const errorMsg = `Invalid input data: ${errors.join(", ")}`;
      errorLogger.warn(errorMsg);
      throw new Error(errorMsg);
    }
  }

  async calculateMetrics(
    machineId,
    totalUnplannedDowntime,
    totalPlannedDowntime,
    totalMicroStops
  ) {
    if (!this.oeeData[machineId]) {
      throw new Error(`No data found for machineId: ${machineId}`);
    }

    this.validateInput(machineId);

    const {
      runtime,
      targetPerformance,
      totalProductionYield,
      totalProductionQuantity,
    } = this.oeeData[machineId];

    try {
      const OEEData = await loadDataAndPrepareOEE(machineId);

      if (!OEEData || !Array.isArray(OEEData.datasets)) {
        throw new Error(
          "Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array."
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
