// Import required modules
const axios = require("axios"); // For making HTTP requests
const { oeeLogger, errorLogger } = require("../utils/logger"); // Custom loggers for OEE and error logging
const { oeeApiUrl } = require("../config/config"); // OEE API URL from configuration
const { loadDataAndPrepareOEE } = require("../src/downtimeManager"); // Function to load and prepare OEE data
const {
  checkForRunningOrder, // Function to check for a running order
  loadProcessOrderDataByMachine, // Function to load process order data by machine
} = require("../src/dataloader"); // Import functions from dataloader

// Define OEE classification levels
const CLASSIFICATION_LEVELS = {
  WORLD_CLASS: 0.85,
  EXCELLENT: 0.7,
  GOOD: 0.6,
  AVERAGE: 0.4,
};

// Define the OEECalculator class
class OEECalculator {
  constructor() {
    this.oeeData = {}; // Object to store OEE data for each machine
  }

  // Reset OEE data to default values
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

  // Initialize OEE data for a machine
  async init(machineId) {
    try {
      oeeLogger.info(`Initializing OEECalculator for machineId ${machineId}`);

      // Load process order data by machine ID
      const processOrderData = await loadProcessOrderDataByMachine(machineId);
      if (processOrderData && processOrderData.length > 0) {
        // Set OEE data using the first running order
        this.setOEEData(processOrderData[0], machineId);
      } else {
        oeeLogger.warn(`No running order found for machineId ${machineId}`);
      }
    } catch (error) {
      // Log and throw an error if initialization fails
      errorLogger.error(
        `Error initializing OEECalculator for machineId ${machineId}: ${error.message}`
      );
      throw error;
    }
  }

  // Set OEE data for a machine using provided data and runtime is newly calculated
  setOEEData(data, machineId) {
    this.oeeData[machineId] = {
      ...this.resetOEEData(), // Start with default values
      ...data, // Override with provided data
      runtime: data.setupTime + data.processingTime + data.teardownTime, // Calculate total runtime
    };
  }

  // Update specific metric data for a machine
  updateData(metric, value, machineId) {
    oeeLogger.info(
      `Updating ${metric} with value: ${value} for machineId: ${machineId}`
    );
    if (!this.oeeData[machineId]) {
      this.oeeData[machineId] = this.resetOEEData(); // Initialize if not already present
    }
    this.oeeData[machineId][metric] = value; // Update the specific metric
  }

  // Validate input data for a machine's OEE calculation
  validateInput(machineId) {
    const {
      plannedProductionQuantity,
      runtime,
      totalProductionQuantity,
      totalProductionYield,
      targetPerformance,
    } = this.oeeData[machineId];

    const errors = [];
    // Validate various OEE metrics
    if (runtime <= 0) errors.push("runtime must be greater than 0");
    if (plannedProductionQuantity <= 0)
      errors.push("plannedProductionQuantity must be greater than 0");
    if (totalProductionQuantity < 0)
      errors.push("totalProductionQuantity must be non-negative");
    if (totalProductionYield < 0)
      errors.push("totalProductionYield must be non-negative");
    if (totalProductionYield > totalProductionQuantity)
      errors.push(
        "totalProductionYield cannot be greater than totalProductionQuantity"
      );

    // Log and throw an error if any validation fails
    if (errors.length > 0) {
      const errorMsg = `Invalid input data: ${errors.join(", ")}`;
      errorLogger.warn(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // Calculate OEE metrics for a machine
  async calculateMetrics(
    machineId,
    totalUnplannedDowntime,
    totalPlannedDowntime,
    totalMicroStops
  ) {
    if (!this.oeeData[machineId]) {
      throw new Error(`No data found for machineId: ${machineId}`);
    }

    this.validateInput(machineId); // Validate input data

    const {
      runtime,
      targetPerformance,
      totalProductionYield,
      totalProductionQuantity,
    } = this.oeeData[machineId];

    try {
      const OEEData = await loadDataAndPrepareOEE(machineId); // Load OEE-related data

      // Validate the structure of the OEEData
      if (!OEEData || !Array.isArray(OEEData.datasets)) {
        throw new Error(
          "Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array."
        );
      }

      // Calculate various OEE components
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

      // Calculate availability, performance, and quality metrics
      const availability =
        (runtime - actualUnplannedDowntime - actualPlannedDowntime) / runtime;
      const performance = totalProductionQuantityTime / targetPerformance;
      const quality = totalProductionYield / totalProductionQuantity;
      const oee = availability * performance * quality; // Calculate OEE

      // Store the calculated metrics
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

  // Classify the OEE value for a machine based on predefined levels
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

    // Return the OEE classification based on the calculated value
    if (oee >= CLASSIFICATION_LEVELS.WORLD_CLASS) return "World-Class";
    if (oee >= CLASSIFICATION_LEVELS.EXCELLENT) return "Excellent";
    if (oee >= CLASSIFICATION_LEVELS.GOOD) return "Good";
    if (oee >= CLASSIFICATION_LEVELS.AVERAGE) return "Average";
    return "Below Average";
  }

  // Retrieve the calculated metrics for a machine
  getMetrics(machineId) {
    if (!this.oeeData[machineId]) {
      throw new Error(`No metrics available for machineId: ${machineId}`);
    }
    return this.oeeData[machineId];
  }
}

// Export the OEECalculator class for use in other modules
module.exports = OEECalculator;
