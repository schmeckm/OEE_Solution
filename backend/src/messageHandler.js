// Import required modules and functions from utility files
const { oeeLogger, errorLogger } = require("../utils/logger");
const { processMetrics, updateMetric } = require("./oeeProcessor");
const {
  handleHoldCommand,
  handleUnholdCommand,
  handleProcessOrderStartCommand,
  handleProcessOrderEndCommand,
} = require("./commandHandler");
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
    if (!this.oeeData) {
      this.oeeData = {};
    }

    if (!this.oeeData[machineId]) {
      this.oeeData[machineId] = {};
    }

    let validMetricProcessed = false;

    const mandatoryStaticMetrics = [
      "plannedProductionQuantity",
      "runtime",
      "targetPerformance",
    ];

    const processOrderData = await loadProcessOrderData(); // Stelle sicher, dass dies async ist

    // Prüfen, ob processOrderData ein Array ist
    if (!Array.isArray(processOrderData)) {
      throw new Error("Process order data is not an array");
    }

    for (const metricData of decodedMessage.metrics) {
      const { name, value } = metricData;
      let metricSource = "undefined";
      let finalValue = value;

      if (oeeConfig[name]) {
        if (oeeConfig[name].machineConnect === true) {
          if (value !== undefined && value !== null && !isNaN(value)) {
            metricSource = "MQTT";

            if (this.oeeData[machineId][name] !== value) {
              await updateMetric(name, value, machineId);
              validMetricProcessed = true;
              this.oeeData[machineId][name] = value;
            }
          } else {
            oeeLogger.warn(
              `Metric ${name} has an invalid value: ${value}. Skipping.`
            );
          }
        } else if (mandatoryStaticMetrics.includes(name)) {
          const order = processOrderData.find(
            (order) => order.machine_id === machineId
          );

          if (order) {
            if (name === "runtime") {
              finalValue =
                order.setupTime + order.processingTime + order.teardownTime;
              metricSource = "Process Order (Calculated)";
            } else {
              finalValue = order[name];
              metricSource = "Process Order";
            }

            if (
              finalValue !== undefined &&
              finalValue !== null &&
              !isNaN(finalValue)
            ) {
              if (this.oeeData[machineId][name] !== finalValue) {
                await updateMetric(name, finalValue, machineId);
                validMetricProcessed = true;
                this.oeeData[machineId][name] = finalValue;
              }
            } else {
              oeeLogger.warn(
                `Static metric ${name} not found or invalid in process order. Skipping.`
              );
            }
          } else {
            oeeLogger.warn(
              `No process order found for machine ID ${machineId}. Skipping metric ${name}.`
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

      let metricEntry = metricsMatrix.find((entry) => entry.metric === name);
      if (metricEntry) {
        metricEntry.source = metricSource;
        metricEntry.value = finalValue !== undefined ? finalValue : "N/A";
        metricEntry.valid = metricSource !== "undefined";
      } else {
        metricsMatrix.push({
          metric: name,
          source: metricSource,
          value: finalValue !== undefined ? finalValue : "N/A",
          valid: metricSource !== "undefined",
        });
      }
    }

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

    oeeLogger.warn(
      "Complete Metrics Matrix: " + JSON.stringify(metricsMatrix, null, 2)
    );
  } catch (error) {
    errorLogger.error(
      `Error processing metrics for machine ${machineId}: ${error.message}`
    );
    errorLogger.error(error.stack);
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
  //   console.log(
  //     `handleCommandMessage called with decodedMessage: ${JSON.stringify(
  //       decodedMessage
  //     )}, machineId: ${machineId}`
  //   );

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
      //   console.log(
      //     `Received command: ${name}, Value: ${value}, Type: ${type}, Alias: ${JSON.stringify(
      //       alias
      //     )}, Machine ID: ${machineId}`
      //   );

      const startTime = Date.now();

      switch (name) {
        case "Hold":
          console.log(`Command/Hold: ${name}`);
          await handleHoldCommand(value, machineId);
          break;
        case "Unhold":
          console.log(`Command/Unhold: ${name}`);
          await handleUnholdCommand(value, machineId);
          break;
        case "Start":
          await handleProcessOrderStartCommand(value, machineId);
          console.log(`Command/Start: ${name}`);
          // Hier könnte in Zukunft eine Funktion hinzugefügt werden, um den Prozessstart zu protokollieren.
          break;

        case "End":
          await handleProcessOrderEndCommand(value, machineId);
          console.log(`Command/End: ${name}`);
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
