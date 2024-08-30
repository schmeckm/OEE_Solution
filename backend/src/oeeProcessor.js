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
} = require("./dataLoader");

const { influxdb } = require("../config/config");
const OEECalculator = require("./oeeCalculator");
const {
  setWebSocketServer,
  sendWebSocketMessage,
} = require("../websocket/webSocketUtils");
const moment = require("moment-timezone");

const oeeCalculators = new Map();
let metricBuffers = new Map();

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

function logMetricBuffer() {
  oeeLogger.warn("Current state of metric buffers:");
  metricBuffers.forEach((buffer, machineId) => {
    oeeLogger.warn(`Machine ID: ${machineId}`);
    Object.keys(buffer).forEach((metricName) => {
      oeeLogger.warn(`  ${metricName}: ${buffer[metricName]}`);
    });
  });
}

async function getPlantAndArea(machineId) {
  try {
    const machines = await loadMachineData();
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

async function updateMetric(name, value, machineId) {
  if (!metricBuffers.has(machineId)) {
    metricBuffers.set(machineId, {});
  }
  const buffer = metricBuffers.get(machineId);

  if (buffer[name] !== value) {
    buffer[name] = value;

    await processMetrics(machineId, buffer);
  }

  logMetricBuffer();
}

async function processMetrics(machineId, buffer) {
  try {
    let calculator = oeeCalculators.get(machineId);
    if (!calculator) {
      calculator = new OEECalculator();
      await calculator.init(machineId);
      oeeCalculators.set(machineId, calculator);
    }

    const { plant, area, lineId } = await getPlantAndArea(machineId);

    calculator.oeeData[machineId] = {
      ...calculator.oeeData[machineId],
      plant,
      area,
      lineId,
    };

    const processOrderData = await loadProcessOrderDataByMachine(machineId);

    if (!processOrderData || processOrderData.length === 0) {
      throw new Error(`No active process order found for machine ${machineId}`);
    }

    const processOrder = processOrderData[0];

    const OEEData = loadDataAndPrepareOEE(machineId);

    if (!OEEData || !Array.isArray(OEEData.datasets)) {
      throw new Error(
        "Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array."
      );
    }

    const totalTimes = calculateTotalTimes(OEEData.datasets);

    validateInputData(totalTimes, machineId);

    await calculator.calculateMetrics(
      machineId,
      totalTimes.unplannedDowntime,
      totalTimes.plannedDowntime + totalTimes.breakTime + totalTimes.microstops,
      processOrder.plannedProductionQuantity,
      processOrder
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

function formatMetrics(metrics, machineId, totalTimes, plant, area, lineId) {
  return {
    oee: metrics.oee,
    availability: metrics.availability,
    performance: metrics.performance,
    quality: metrics.quality,
    level: metrics.classification,
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
