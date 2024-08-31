const path = require("path");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { writeOEEToInfluxDB } = require("../services/oeeMetricsService");
const {
  loadMachineData,
  loadDataAndPrepareOEE,
  loadProcessOrderDataByMachine,
} = require("./dataLoader");
const { influxdb } = require("../config/config");
const OEECalculator = require("./oeeCalculator");
const {
  setWebSocketServer,
  sendWebSocketMessage,
} = require("../websocket/webSocketUtils");

const oeeCalculators = new Map(); // Map to store OEE calculators per machine ID
let metricBuffers = new Map(); // Buffer to store metrics per machine

function logTabularData(metrics) {
  const {
    lineId,
    oee,
    availability,
    performance,
    quality,
    plannedProductionQuantity,
    ProductionQuantity,
    plannedDurationMinutes,
    plannedTakt,
    actualTakt,
    setupTime,
    teardownTime,
    classification,
  } = metrics;
  const logTable = `
  +-----------------------------------------------+---------------------+
  | Metric                                        | Value               | 
  +-----------------------------------------------+---------------------+
  | Machine                                       | ${lineId.padEnd(2)}|
  | Availability (%)                              | ${availability
    .toFixed(2)
    .padStart(6)}%         |
  | Performance (%)                               | ${performance
    .toFixed(2)
    .padStart(6)}%         |
  | Quality (%)                                   | ${quality
    .toFixed(2)
    .padStart(6)}%         |
  | OEE (%)                                       | ${oee
    .toFixed(2)
    .padStart(6)}%         |
  | Classification                                | ${classification.padEnd(
    2
  )}     |
  | Planned Production Quantity                   | ${plannedProductionQuantity
    .toString()
    .padStart(6)}          |
  | Actual Production Quantity                    | ${ProductionQuantity.toString().padStart(
    6
  )}          |
  | Production Time (Min)                         | ${plannedDurationMinutes
    .toString()
    .padStart(6)}          |
  | Setup Time (Min)                              | ${setupTime
    .toString()
    .padStart(6)}          |
  | Teardown Time (Min)                           | ${teardownTime
    .toString()
    .padStart(6)}          |
  | Planned Takt (Min/unit)                       | ${plannedTakt
    .toFixed(2)
    .padStart(6)}          |
  | Actual Takt (Min/unit)                        | ${actualTakt
    .toFixed(2)
    .padStart(6)}          |
  +-----------------------------------------------+--------------------+
  `;
  oeeLogger.log(logTable);
  console.log(logTable);
}

function logMetricBuffer() {
  oeeLogger.info("Current state of metric buffers:");
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
    metricBuffers.set(machineId, {}); // Initialize buffer if it doesn't exist
  }

  const buffer = metricBuffers.get(machineId);

  oeeLogger.info(`Updating buffer for machine ${machineId}:`, buffer);

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
      ...buffer, // Add the buffer data to the oeeData object
    };

    const processOrderData = await loadProcessOrderDataByMachine(machineId);

    if (!processOrderData || processOrderData.length === 0) {
      throw new Error(`No active process order found for machine ${machineId}`);
    }

    const processOrder = processOrderData[0];
    const OEEData = await loadDataAndPrepareOEE(machineId);

    validateOEEData(OEEData);

    const totalTimes = calculateTotalTimes(OEEData.datasets);

    validateInputData(totalTimes, machineId);

    await calculator.calculateMetrics(
      machineId,
      totalTimes.unplannedDowntime,
      totalTimes.plannedDowntime + totalTimes.breakTime + totalTimes.microstops,
      buffer.plannedProductionQuantity || 0,
      buffer.totalProductionQuantity || 0,
      buffer.totalProductionYield || 0,
      processOrder
    );

    const metrics = calculator.getMetrics(machineId);

    if (!metrics) {
      throw new Error(
        `Metrics could not be calculated for machineId: ${machineId}.`
      );
    }

    logTabularData(metrics);

    if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
      //await writeOEEToInfluxDB(metrics);
      const formattedMetrics = formatMetrics(
        metrics,
        machineId,
        totalTimes,
        plant,
        area,
        lineId
      );
      oeeLogger.debug("Metrics written to InfluxDB.");
    }

    sendWebSocketMessage("OEEData", OEEData);
    oeeLogger.info(`OEE Data: ${JSON.stringify(OEEData)}`);
  } catch (error) {
    errorLogger.error(
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

function validateOEEData(OEEData) {
  if (!OEEData || !Array.isArray(OEEData.datasets) || !OEEData.labels) {
    throw new Error("Invalid OEEData format.");
  }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };
