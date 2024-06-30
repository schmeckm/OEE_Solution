const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const logger = require('../utils/logger');
const { influxdb, oeeAsPercent } = require('../config/config');

let writeApi = null;

// Initialize InfluxDB write API if the InfluxDB configuration is available
if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
    const influxDB = new InfluxDB({ url: influxdb.url, token: influxdb.token });
    writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);
}

/**
 * Calculate the Overall Equipment Effectiveness (OEE)
 * 
 * @param {Object} data - The input data containing plannedProduction, runtime, actualPerformance, targetPerformance, goodProducts, and totalProduction
 * @returns {Object} - The calculated OEE, availability, performance, and quality
 */
function calculateOEE(data) {
    const availability = data.runtime / data.plannedProduction;
    const performance = data.actualPerformance / data.targetPerformance;
    const quality = data.goodProducts / data.totalProduction;
    const oee = availability * performance * quality * 100;

    return { oee, availability, performance, quality };
}

/**
 * Write the OEE data to InfluxDB
 * 
 * @param {number} oee - The calculated OEE value
 * @param {number} availability - The calculated availability value
 * @param {number} performance - The calculated performance value
 * @param {number} quality - The calculated quality value
 * @param {Object} metadata - Additional metadata for tagging the data point in InfluxDB
 */
function writeOEEToInfluxDB(oee, availability, performance, quality, metadata) {
    if (writeApi) {
        const point = new Point('oee')
            .tag('plant', metadata.group_id)
            .tag('area', 'Packaging')
            .tag('line', metadata.edge_node_id);

        // Add additional metadata tags
        Object.keys(metadata).forEach(key => {
            if (typeof metadata[key] !== 'object') {
                point.tag(key, metadata[key]);
            }
        });

        // Add fields to the data point
        point
            .floatField('oee', oeeAsPercent ? oee : oee / 100)
            .floatField('availability', oeeAsPercent ? availability * 100 : availability)
            .floatField('performance', oeeAsPercent ? performance * 100 : performance)
            .floatField('quality', oeeAsPercent ? quality * 100 : quality);

        // Write the data point to InfluxDB
        writeApi.writePoint(point);

        // Flush the write API to ensure data is sent to InfluxDB
        writeApi.flush().catch(err => {
            logger.error(`Error writing to InfluxDB: ${err}`);
        });
    }
}

module.exports = { calculateOEE, writeOEEToInfluxDB };