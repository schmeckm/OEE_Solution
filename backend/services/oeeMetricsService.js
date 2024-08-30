// services/oeeMetricsService.js

const { Point } = require("@influxdata/influxdb-client");
const { getWriteApi } = require("./influxDBService"); // Ensure this path is correct
const { oeeLogger, defaultLogger, errorLogger } = require("../utils/logger");

/**
 * Writes the OEE data to InfluxDB.
 * Uses InfluxDB's write API which should be initialized at application start.
 * @param {Object} metrics - The OEE metrics data to send to InfluxDB.
 */
async function writeOEEToInfluxDB(metrics) {
  try {
    const writeApi = getWriteApi(); // Retrieves the initialized InfluxDB write API
    const point = new Point("oee_metrics")
      .tag("plant", metrics.processData.plant || "UnknownPlant")
      .tag("area", metrics.processData.area || "UnknownArea")
      .tag("machineId", metrics.processData.machineId || "UnknownMachine")
      .tag(
        "ProcessOrderNumber",
        metrics.processData.ProcessOrderNumber || "UnknownOrder"
      )
      .tag(
        "MaterialNumber",
        metrics.processData.MaterialNumber || "UnknownMaterial"
      )
      .tag(
        "MaterialDescription",
        metrics.processData.MaterialDescription || "No Description"
      )
      .floatField("oee", metrics.oeeAsPercent ? metrics.oee : metrics.oee / 100)
      .floatField(
        "availability",
        metrics.oeeAsPercent ? metrics.availability * 100 : metrics.availability
      )
      .floatField(
        "performance",
        metrics.oeeAsPercent ? metrics.performance * 100 : metrics.performance
      )
      .floatField(
        "quality",
        metrics.oeeAsPercent ? metrics.quality * 100 : metrics.quality
      )
      .floatField(
        "plannedProductionQuantity",
        metrics.processData.plannedProductionQuantity
      )
      .floatField("plannedDowntime", metrics.processData.plannedDowntime)
      .floatField("unplannedDowntime", metrics.processData.unplannedDowntime)
      .floatField("microstops", metrics.processData.microstops);

    writeApi.writePoint(point);
    await writeApi.flush(); // Ensure that the point is written to the database

    oeeLogger.info(
      `Successfully wrote OEE metrics for machine ID: ${
        metrics.processData.machineId || "undefined"
      } to InfluxDB.`
    );
  } catch (error) {
    errorLogger.error(`Error writing to InfluxDB: ${error.message}`);
    throw error; // Rethrow the error to be handled by the caller
  }
}

module.exports = { writeOEEToInfluxDB };
