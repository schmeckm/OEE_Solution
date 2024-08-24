// Import required modules and functions from utility files
const { oeeLogger, errorLogger } = require("../utils/logger");
const { processMetrics, updateMetric } = require("./oeeProcessor");
const { handleHoldCommand, handleUnholdCommand } = require("./commandHandler");
const oeeConfig = require("../config/oeeConfig.json");
const { loadProcessOrderData } = require("./dataLoader");

// Persistent metrics matrix to keep track of all metrics over time
let metricsMatrix = [];

/**
 * Processes OEE (Overall Equipment Effectiveness) messages by updating the relevant metrics
 * and triggering the metric processing workflow.
 *
 * @param {Object} decodedMessage - The decoded message containing OEE metrics.
 * @param {string} machineId - The machine ID.
 */
async function handleOeeMessage(decodedMessage, machineId) {
  oeeLogger.debug(
    `handleOeeMessage called with decodedMessage: ${JSON.stringify(
      decodedMessage
    )}, machineId: ${machineId}`
  );

  try {
    // Initialize this.oeeData if it doesn't exist
    if (!this.oeeData) {
      this.oeeData = {}; // Initialize this.oeeData as an empty object
    }

    // Ensure there's an entry for machineId
    if (!this.oeeData[machineId]) {
      this.oeeData[machineId] = {}; // Initialize the entry for machineId as an empty object
    }

    // Flag to check if any valid metric was processed
    let validMetricProcessed = false;

    // List of mandatory static metrics from the process order
    const mandatoryStaticMetrics = [
      "plannedProductionQuantity",
      "runtime",
      "targetPerformance",
    ];

    // Load process order data (static values)
    const processOrderData = loadProcessOrderData();

    // Process each metric from the decoded MQTT message
    for (const metricData of decodedMessage.metrics) {
      const { name, value } = metricData;
      let metricSource = "undefined";
      let finalValue = value;

      // Check if the metric is in the OEE configuration
      if (oeeConfig[name]) {
        if (oeeConfig[name].machineConnect === true) {
          // Use value from MQTT
          if (value !== undefined && value !== null && !isNaN(value)) {
            metricSource = "MQTT";

            // Only update if the value has changed
            if (this.oeeData[machineId][name] !== value) {
              await updateMetric(name, value, machineId);
              validMetricProcessed = true;
              this.oeeData[machineId][name] = value; // Update the stored value
            }
          } else {
            oeeLogger.warn(
              `Metric ${name} has an invalid value: ${value}. Skipping.`
            );
          }
        } else if (mandatoryStaticMetrics.includes(name)) {
          // Use value from process order, specifically for runtime
          const order = processOrderData.find(
            (order) => order.machine_id === machineId
          );

          if (name === "runtime" && order) {
            finalValue =
              order.setupTime + order.processingTime + order.teardownTime;
            metricSource = "Process Order (Calculated)";
          } else {
            finalValue = order ? order[name] : undefined;
            metricSource = "Process Order";
          }

          if (
            finalValue !== undefined &&
            finalValue !== null &&
            !isNaN(finalValue)
          ) {
            // Only update if the value has changed
            if (this.oeeData[machineId][name] !== finalValue) {
              await updateMetric(name, finalValue, machineId);
              validMetricProcessed = true;
              this.oeeData[machineId][name] = finalValue; // Update the stored value
            }
          } else {
            oeeLogger.warn(
              `Static metric ${name} not found or invalid in process order. Skipping.`
            );
          }
        } else {
          oeeLogger.warn(
            `Metric ${name} is neither marked for calculation nor mandatory. Skipping.`
          );
        }
      } else {
        oeeLogger.warn(`Metric ${name} is not defined in oeeConfig.`);
      }

      // Update the matrix with the latest metric information
      let metricEntry = metricsMatrix.find((entry) => entry.metric === name);
      if (metricEntry) {
        // Update existing entry
        metricEntry.source = metricSource;
        metricEntry.value = finalValue !== undefined ? finalValue : "N/A";
        metricEntry.valid = metricSource !== "undefined";
      } else {
        // Add new entry
        metricsMatrix.push({
          metric: name,
          source: metricSource,
          value: finalValue !== undefined ? finalValue : "N/A",
          valid: metricSource !== "undefined",
        });
      }
    }

    // Only proceed with metric processing if at least one valid metric was processed
    if (validMetricProcessed) {
      await processMetrics(machineId);
      oeeLogger.debug(
        `Final OEE data after processing for ${machineId}: ${JSON.stringify(
          this.oeeData[machineId],
          null,
          2
        )}`
      );
    } else {
      oeeLogger.warn(
        `No valid metrics were processed for machine ${machineId}. Skipping metric processing.`
      );
    }

    // Log the complete metrics matrix
    oeeLogger.warn(
      "Complete Metrics Matrix: " + JSON.stringify(metricsMatrix, null, 2)
    );
  } catch (error) {
    errorLogger.error(
      `Error processing metrics for machine ${machineId}: ${error.message}`
    );
    errorLogger.error(error.stack); // Log error stack trace for debugging
  }
}

/**
 * Processes command messages by delegating the handling to appropriate command handlers
 * based on the command type.
 * It is used to handle Hold and Unhold commands to record the start and end times of the hold state for unplanned downtime.
 *
 * @param {Object} decodedMessage - The decoded message containing command metrics.
 * @param {string} machineId - The machine ID.
 */
async function handleCommandMessage(decodedMessage, machineId) {
  oeeLogger.debug(
    `handleCommandMessage called with decodedMessage: ${JSON.stringify(
      decodedMessage
    )}, machineId: ${machineId}`
  );

  try {
    if (
      !decodedMessage ||
      !decodedMessage.metrics ||
      !Array.isArray(decodedMessage.metrics)
    ) {
      throw new Error("Invalid decodedMessage format");
    }

    for (const metricData of decodedMessage.metrics) {
      const { name, value, type, alias } = metricData;
      oeeLogger.warn(
        `Received command: ${name}, Value: ${value}, Type: ${type}, Alias: ${JSON.stringify(
          alias
        )}, Machine ID: ${machineId}`
      );

      const startTime = Date.now();

      switch (name) {
        case "Command/Hold":
          await handleHoldCommand(value, machineId);
          break;
        case "Command/Unhold":
          await handleUnholdCommand(value, machineId);
          break;
        case "Command/Start":
          await handleProcessOrderStartCommand(value, machineId);
          // Hier könnte in Zukunft eine Funktion hinzugefügt werden, um den Prozessstart zu protokollieren.
          break;
        case "Command/End":
          await handleProcessOrderEndCommand(value, machineId);
          // Hier könnte in Zukunft eine Funktion hinzugefügt werden, um das Prozessende zu protokollieren.
          break;
        default:
          oeeLogger.warn(`Unknown command: ${name}`);
          break;
      }

      const endTime = Date.now();
      oeeLogger.debug(`Processed command: ${name} in ${endTime - startTime}ms`);
    }
  } catch (error) {
    errorLogger.error(`Error in handleCommandMessage: ${error.message}`);
    errorLogger.error(error.stack);
  }
}

// Export the functions to be used in other modules
module.exports = { handleOeeMessage, handleCommandMessage };
