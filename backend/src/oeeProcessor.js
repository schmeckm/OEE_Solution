const fs = require("fs").promises;
const path = require("path");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { writeOEEToInfluxDB } = require("../services/oeeMetricsService");
const {
  loadDataAndPrepareOEE,
  loadProcessOrderData,
} = require("../src/downtimeManager");
const {
  loadMachineData,
  loadProcessOrderDataByMachine,
} = require("./dataLoader"); // Import the function from dataLoader.js

const { influxdb } = require("../config/config");
const OEECalculator = require("./oeeCalculator");
const {
  setWebSocketServer,
  sendWebSocketMessage,
} = require("../websocket/webSocketUtils");
const moment = require("moment-timezone");

const oeeCalculators = new Map(); // Map to store OEE calculators per machine ID
let metricBuffers = new Map(); // Buffer to store metrics per machine

/**
 * Logs OEE metrics in a tabular format.
 * @param {Object} metrics - The metrics object from the OEECalculator.
 */
function logTabularData(metrics) {
  const {
    oee,
    availability,
    performance,
    quality,
    plannedProductionQuantity,
    actualProductionQuantity,
    productionTime,
    setupTime,
    teardownTime,
  } = metrics;

  const logTable = `
   +------------------------------------+------------------+
| Metric                             | Value            |
+------------------------------------+------------------+
| Availability (%)                   | ${availability.toFixed(2)}%  |
| Performance (%)                    | ${performance.toFixed(2)}%  |
| Quality (%)                        | ${quality.toFixed(2)}%  |
| OEE (%)                            | ${oee.toFixed(2)}%  |
| Planned Production Quantity        | ${plannedProductionQuantity}  |
| Actual Production                  | ${actualProductionQuantity}  |
| Production Time (Min)              | ${productionTime}  |
| Setup Time (Min)                   | ${setupTime}       |
| Teardown Time (Min)                | ${teardownTime}    |
+------------------------------------+------------------+
    `;

  oeeLogger.info(logTable);
}

/**
 * Logs the current buffer state for all machines.
 */
function logMetricBuffer() {
  oeeLogger.warn("Current state of metric buffers:");
  metricBuffers.forEach((buffer, machineId) => {
    oeeLogger.warn(`Machine ID: ${machineId}`);
    Object.keys(buffer).forEach((metricName) => {
      oeeLogger.warn(`  ${metricName}: ${buffer[metricName]}`);
    });
  });
}
/**
 * Retrieves the plant and area based on the MachineID.
 * @param {string} machineId - The ID of the machine.
 * @returns {Promise<Object>} A promise that resolves to an object containing the plant and area.
 */
async function getPlantAndArea(machineId) {
  try {
    const machines = await loadMachineData(); // Use the existing function from dataLoader.js

    const machine = machines.find((m) => m.machine_id === machineId);

    if (machine) {
      return {
        plant: machine.Plant || "UnknownPlant",
        area: machine.area || "UnknownArea",
        lineId: machine.name || "UnknownLine",
      };
    } else {
      errorLogger.info(
        `Plant, Area, and LineID not found for machineId: ${machineId}`
      );
      return {
        plant: "UnknownPlant",
        area: "UnknownArea",
        lineId: "UnknownLine",
      };
    }
  } catch (error) {
    errorLogger.error(
      `Error retrieving plant and area for machineId ${machineId}: ${error.message}`
    );
    return {
      plant: "UnknownPlant",
      area: "UnknownArea",
      lineId: "UnknownLine",
    };
  }
}

/**
 * Updates a metric with a new value and processes it immediately if it has changed.
 * If the OEECalculator for the machine does not exist, it initializes one.
 * @param {string} name - The name of the metric.
 * @param {number} value - The value of the metric.
 * @param {string} machineId - The MachineID or Workcenter.
 */
async function updateMetric(name, value, machineId) {
  if (!metricBuffers.has(machineId)) {
    metricBuffers.set(machineId, {}); // Initialize buffer if it doesn't exist
  }

  const buffer = metricBuffers.get(machineId);

  if (buffer[name] !== value) {
    // Only update and recalculate if the metric has changed
    buffer[name] = value;

    await processMetrics(machineId);
  }

  // Log the current buffer state after each update
  logMetricBuffer();
}

/**
 * Processes metrics, calculates OEE, and sends the data via WebSocket only if there are changes, for a specific MachineID.
 * Prevents multiple processes from running for the same machine simultaneously.
 * @param {string} machineId - The MachineID or Workcenter.
 */
async function processMetrics(machineId) {
  // We do not check processing here because metrics are only processed when they change

  try {
    let calculator = oeeCalculators.get(machineId);
    if (!calculator) {
      calculator = new OEECalculator();

      // Initialize the OEECalculator for the machine if it doesn't exist
      await calculator.init(machineId);
      oeeCalculators.set(machineId, calculator);
    }

    // Get the plant, area, and lineId for the machine
    const { plant, area, lineId } = await getPlantAndArea(machineId);
    const buffer = metricBuffers.get(machineId);

    // Use loadProcessOrderDataByMachine to load the process order data
    const processOrderData = await loadProcessOrderDataByMachine(machineId);

    if (!processOrderData || processOrderData.length === 0) {
      throw new Error(`No active process order found for machine ${machineId}`);
    }

    const processOrder = processOrderData[0]; // Assuming the first order is the one you need

    //here we are updating the plannedProductionQuantity in the oeeData object
    this.oeeData[machineId].plannedProductionQuantity =
      processOrder.plannedProductionQuantity;

    const OEEData = loadDataAndPrepareOEE(machineId);
    if (!OEEData || !Array.isArray(OEEData.datasets)) {
      throw new Error(
        "Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array."
      );
    }

    const plannedProductionQuantity = processOrder.plannedProductionQuantity;

    const totalTimes = calculateTotalTimes(OEEData.datasets);

    validateInputData(totalTimes, machineId);

    // Use the plannedProductionQuantity from the process order in the OEE calculation
    await calculator.calculateMetrics(
      machineId,
      totalTimes.unplannedDowntime,
      totalTimes.plannedDowntime + totalTimes.breakTime + totalTimes.microstops,
      plannedProductionQuantity // Pass the plannedProductionQuantity here
    );

    const metrics = calculator.getMetrics(machineId);
    if (!metrics) {
      throw new Error(
        `Metrics could not be calculated or are undefined for machineId: ${machineId}.`
      );
    }

    const roundedMetrics = formatMetrics(
      metrics,
      machineId,
      totalTimes,
      plant,
      area,
      lineId
    );
    logTabularData(roundedMetrics);

    if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
      await writeOEEToInfluxDB(roundedMetrics);
      oeeLogger.debug("Metrics written to InfluxDB.");
    }

    sendWebSocketMessage("OEEData", OEEData);
    oeeLogger.info(`OEE Data: ${JSON.stringify(OEEData)}`);
  } catch (error) {
    errorLogger.warn(
      `Error calculating metrics for machine ${machineId}: ${error.message}`
    );
  }
}

/**
 * Calculates the total times for production, downtime, and breaks from the dataset.
 * @param {Array} datasets - The array of datasets from OEE data.
 * @returns {Object} An object containing calculated total times.
 */
function calculateTotalTimes(datasets) {
  return datasets.reduce(
    (totals, dataset, index) => {
      const total = dataset.data.reduce((a, b) => a + b, 0);
      switch (index) {
        case 0:
          totals.productionTime = total;
          break;
        case 1:
          totals.breakTime = total;
          break;
        case 2:
          totals.unplannedDowntime = total;
          break;
        case 3:
          totals.plannedDowntime = total;
          break;
        case 4:
          totals.microstops = total;
          break;
        default:
          break;
      }
      return totals;
    },
    {
      productionTime: 0,
      breakTime: 0,
      unplannedDowntime: 0,
      plannedDowntime: 0,
      microstops: 0,
    }
  );
}

/**
 * Validation function to ensure that the data is valid before calculations.
 * @param {Object} totalTimes - Object containing total production, downtime, and break times.
 * @param {string} machineId - The MachineID or Workcenter.
 */
function validateInputData(totalTimes, machineId) {
  const { unplannedDowntime, plannedDowntime, productionTime } = totalTimes;

  if (productionTime <= 0) {
    throw new Error(
      `Invalid input data for machine ${machineId}: productionTime must be greater than 0`
    );
  }

  if (unplannedDowntime < 0 || plannedDowntime < 0) {
    throw new Error(
      `Invalid input data for machine ${machineId}: downtime values must be non-negative`
    );
  }
}

/**
 * Formats the metrics into a structured object for logging and database storage.
 * @param {Object} metrics - The metrics object from the OEECalculator.
 * @param {string} machineId - The MachineID or Workcenter.
 * @param {Object} totalTimes - Object containing total production, downtime, and break times.
 * @param {string} plant - The plant associated with the machine.
 * @param {string} area - The area associated with the machine.
 * @param {string} lineId - The lineId associated with the machine.
 * @returns {Object} Formatted metrics.
 */
function formatMetrics(metrics, machineId, totalTimes, plant, area, lineId) {
  return {
    oee: metrics.oee,
    availability: metrics.availability,
    performance: metrics.performance,
    quality: metrics.quality,
    level: metrics.classification, // Use the classification from OEECalculator
    plannedProductionQuantity: metrics.plannedProductionQuantity,
    actualProductionQuantity: metrics.actualProductionQuantity,
    productionTime: totalTimes.productionTime,
    setupTime: metrics.setupTime,
    teardownTime: metrics.teardownTime,
    processData: {
      ProcessOrderNumber: metrics.ProcessOrderNumber,
      StartTime: metrics.StartTime,
      EndTime: metrics.EndTime,
      plannedProductionQuantity: metrics.plannedProductionQuantity,
      plannedDowntime: totalTimes.plannedDowntime,
      unplannedDowntime: totalTimes.unplannedDowntime,
      microstops: totalTimes.microstops,
      MaterialNumber: metrics.MaterialNumber,
      MaterialDescription: metrics.MaterialDescription,
      machineId,
      plant,
      area,
      lineId,
    },
  };
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };
