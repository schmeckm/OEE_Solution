const fs = require("fs").promises;
const path = require("path");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { writeOEEToInfluxDB } = require("../services/oeeMetricsService");
const { loadDataAndPrepareOEE } = require("../src/downtimeManager");
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
        setupTime,
        teardownTime,
    } = metrics;

    const logTable = `
+---------------------------------------+---------------------------+
| Metric                             | Value                        | 
+------------------------------------+------------------------------+
| Machine                            | ${lineId}                    |
| Availability (%)                   | ${availability.toFixed(2)}%  |
| Performance (%)                    | ${performance.toFixed(2)}%   |
| Quality (%)                        | ${quality.toFixed(2)}%       |
| OEE (%)                            | ${oee.toFixed(2)}%           |
| Planned Production Quantity        | ${plannedProductionQuantity} |
| Actual Production                  | ${ProductionQuantity}        |
| Production Time (Min)              | ${plannedDurationMinutes}    |
| Setup Time (Min)                   | ${setupTime}                 |
| Teardown Time (Min)                | ${teardownTime}              |
+------------------------------------+------------------------------+
    `;

    oeeLogger.info(logTable);
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
    //Store all data from messagehandler in the buffer
    const buffer = metricBuffers.get(machineId);

    // Check and update the buffer with the new value if the value has been changed
    if (buffer[name] !== value) {
        buffer[name] = value;
        // Call the processMetrics function, passing the machineId and buffer as an argument
        await processMetrics(machineId, buffer);
    }
    // Log the current buffer state after each update
    logMetricBuffer();
}

async function processMetrics(machineId, buffer) {
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

        // Adding plant, area, and lineId to the calculator's oeeData
        calculator.oeeData[machineId] = {
            ...calculator.oeeData[machineId],
            plant,
            area,
            lineId,
            ...buffer, // Add the buffer data to the oeeData object
        };

        // Load the process order data
        const processOrderData = await loadProcessOrderDataByMachine(machineId);

        if (!processOrderData || processOrderData.length === 0) {
            throw new Error(`No active process order found for machine ${machineId}`);
        }

        const processOrder = processOrderData[0]; // Assuming the first order is the one you need

        // Prepare the OEE data
        const OEEData = loadDataAndPrepareOEE(machineId);

        if (!OEEData || !Array.isArray(OEEData.datasets)) {
            throw new Error(
                "Invalid OEEData returned from loadDataAndPrepareOEE. Expected an object with a datasets array."
            );
        }

        // Calculate the total times
        const totalTimes = calculateTotalTimes(OEEData.datasets);

        // Validate the input data
        validateInputData(totalTimes, machineId);

        // Use the plannedProductionQuantity from the buffer to calculate metrics
        await calculator.calculateMetrics(
            machineId,
            totalTimes.unplannedDowntime,
            totalTimes.plannedDowntime + totalTimes.breakTime + totalTimes.microstops,
            buffer.plannedProductionQuantity, // Use the value from the buffer
            buffer.totalProductionQuantity,
            buffer.totalProductionYield,
            processOrder
        );

        // Retrieve the complete metrics
        const metrics = calculator.getMetrics(machineId);

        if (!metrics) {
            throw new Error(
                `Metrics could not be calculated or are undefined for machineId: ${machineId}.`
            );
        }

        logTabularData(metrics);

        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(roundedMetrics);
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
        }, {
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