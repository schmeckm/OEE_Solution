// oeeCalculator.js
const axios = require("axios");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { oeeApiUrl } = require("../config/config");
const { loadDataAndPrepareOEE } = require("../src/downtimeManager");
const { loadProcessOrderData } = require("../src/dataLoader");

const VALID_SCORE_THRESHOLD = 1.0;
const MINIMUM_SCORE_THRESHOLD = 0.0;

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

      // API-Aufruf, um Prozessauftragsdaten zu laden
      const response = await fetch(apiEndpoint);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch process order data: ${response.statusText}`
        );
      }

      const processOrderData = await response.json();

      this.setOEEData(processOrderData[0], machineId);

      oeeLogger.debug(
        `OEE Data set for machineId ${machineId}: ${JSON.stringify(
          this.oeeData[machineId]
        )}`
      );
    } catch (error) {
      errorLogger.error(
        `Error initializing OEECalculator for machineId ${machineId}: ${error.message}`
      );
      throw error;
    }
  }

  setOEEData(data, machineId) {
    if (!this.oeeData[machineId]) {
      this.oeeData[machineId] = this.resetOEEData();
    }

    const {
      ProcessOrderNumber,
      MaterialNumber,
      MaterialDescription,
      Start,
      End,
      setupTime,
      processingTime,
      teardownTime,
      plannedProductionQuantity,
      totalProductionYield,
      totalProductionQuantity,
      targetPerformance,
      machine_id,
      ProcessOrderStatus,
    } = data;

    oeeLogger.warn(
      `Setting OEE Data for machineId ${machineId}: ProcessOrderNumber=${ProcessOrderNumber}, MaterialNumber=${MaterialNumber}, MaterialDescription=${MaterialDescription}, plannedProductionQuantity=${plannedProductionQuantity}`
    );

    // Validierung der Prozessauftragsdaten mit zusätzlichen Metriken und übergebenen Daten
    this.oeeData[machineId] = {
      ...this.oeeData[machineId],
      ProcessOrderNumber,
      MaterialNumber,
      MaterialDescription,
      StartTime: Start,
      EndTime: End,
      setupTime,
      processingTime,
      teardownTime,
      runtime: setupTime + processingTime + teardownTime,
      targetPerformance,
      plannedProductionQuantity,
      totalProductionYield,
      totalProductionQuantity,
    };
  }

  // Aktualisierung der OEE-Daten
  updateData(metric, value, machineId) {
    oeeLogger.debug(
      `Updating ${metric} with value: ${value} for machineId: ${machineId}`
    );
    if (!this.oeeData[machineId]) {
      this.oeeData[machineId] = this.resetOEEData();
    }
    this.oeeData[machineId][metric] = value;
  }

  // Validierung der Eingabedaten
  validateInput(machineId) {
    const {
      plannedProductionQuantity,
      runtime,
      setupTime,
      processingTime,
      teardownTime,
      totalProductionYield,
      targetPerformance,
      totalProductionQuantity,
    } = this.oeeData[machineId];

    // Überprüfen, ob die Eingabedaten gültig sind und Paraemter korrekt gesetzt sind und sich schlüssig verhalten
    if (runtime <= 0)
      throw new Error("Invalid input data: runtime must be greater than 0");
    if (plannedProductionQuantity <= 0)
      throw new Error(
        "Invalid input data: plannedProductionQuantity must be greater than 0"
      );
    if (totalProductionQuantity < 0)
      throw new Error(
        "Invalid input data: totalProductionQuantity must be non-negative"
      );

    if (totalProductionYield < 0)
      throw new Error(
        "Invalid input data: totalProductionYield must be non-negative"
      );
    if (totalProductionQuantity > targetPerformance)
      throw new Error(
        "Invalid input data: totalProductionQuantity cannot be greater than targetPerformance"
      );
    if (totalProductionYield > totalProductionQuantity)
      throw new Error(
        "Invalid input data: totalProductionYield cannot be greater than totalProductionQuantity"
      );
  }

  //Ab hier sind alle Daten vorhanden und die Metriken können berechnet werden aus der OEE Processor.js
  //Hier wird die Machine ID übergeben und die Metriken werden berechnet und die TotalUnplannedDowntime, TotalPlannedDowntime und TotalMicroStops werden übergeben

  async calculateMetrics(
    machineId,
    totalUnplannedDowntime,
    totalPlannedDowntime,
    totalMicroStops
  ) {
    if (!this.oeeData[machineId]) {
      throw new Error(`No data found for machineId: ${machineId}`);
    }

    // Validierung der Eingabedaten erneut durchführen mit den übergebenen Daten
    this.validateInput(machineId);

    const {
      plannedProductionQuantity,
      runtime,
      setupTime,
      processingTime,
      teardownTime,
      targetPerformance,
      totalProductionYield,
      totalProductionQuantity,
      ProcessOrderNumber,
      StartTime,
      EndTime,
    } = this.oeeData[machineId];
    oeeLogger.debug(
      `Calculating metrics for ProcessOrderNumber: ${ProcessOrderNumber} on machineId: ${machineId}`
    );

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
      const totalBreakTime = OEEData.datasets[1].data.reduce(
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

      oeeLogger.debug(
        `Total production quantity time: ${totalProductionQuantityTime}`
      );
      oeeLogger.debug(`Total break time: ${totalBreakTime}`);
      oeeLogger.debug(`Total unplanned downtime: ${actualUnplannedDowntime}`);
      oeeLogger.debug(`Total planned downtime: ${actualPlannedDowntime}`);
      oeeLogger.debug(`Total micro stops: ${actualMicroStops}`);

      // Berechnung der Metriken mit den OEE Daten
      const availability =
        (runtime - actualUnplannedDowntime - actualPlannedDowntime) / runtime;

      const performance = totalProductionQuantityTime / targetPerformance;

      //const performance = actualProductionQuantity / plannedProductionQuantity;

      const quality = totalProductionYield / totalProductionQuantity;
      const oee = availability * performance * quality;

      //Wegschreiben der OEE Daten
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
    const oeeData = this.oeeData[machineId];
    const oee = oeeData ? oeeData.oee : undefined;

    if (oee === undefined) {
      throw new Error(`OEE not calculated for machineId: ${machineId}`);
    }

    if (oee >= CLASSIFICATION_LEVELS.WORLD_CLASS) {
      return "World-Class";
    } else if (oee >= CLASSIFICATION_LEVELS.EXCELLENT) {
      return "Excellent";
    } else if (oee >= CLASSIFICATION_LEVELS.GOOD) {
      return "Good";
    } else if (oee >= CLASSIFICATION_LEVELS.AVERAGE) {
      return "Average";
    } else {
      return "Below Average";
    }
  }

  getMetrics(machineId) {
    if (!this.oeeData[machineId]) {
      throw new Error(`No metrics available for machineId: ${machineId}`);
    }
    return this.oeeData[machineId];
  }
}

module.exports = OEECalculator;
