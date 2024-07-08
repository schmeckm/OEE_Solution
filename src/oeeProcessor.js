const { oeeLogger, errorLogger } = require('../utils/logger'); // Importing logger instances for logging
const { OEECalculator, writeOEEToInfluxDB } = require('../utils/oeeCalculator'); // Importing OEECalculator class and InfluxDB writer
const { getPlannedDowntime, calculateTotalPlannedDowntime } = require('../utils/downtimeManager'); // Importing functions for managing planned downtime
const { loadProcessOrder } = require('../utils/processOrderManager'); // Importing function to load process orders
const oeeConfig = require('../config/oeeConfig.json'); // Importing OEE configuration settings
const { influxdb, oeeAsPercent, structure } = require('../config/config'); // Importing InfluxDB and other configuration settings

const oeeCalculator = new OEECalculator(); // Creating an instance of OEECalculator
let receivedMetrics = {}; // Object to store received metrics

/**
 * Updates a metric in the receivedMetrics object and in the OEECalculator instance.
 * 
 * @param {string} name - The name of the metric to update
 * @param {number} value - The new value of the metric
 */
function updateMetric(name, value) {
    receivedMetrics[name] = value; // Update receivedMetrics object
    oeeCalculator.updateData(name, value); // Update metric in OEECalculator instance
}

/**
 * Processes metrics including loading process order, calculating downtime,
 * calculating OEE metrics, logging results, and optionally writing to InfluxDB.
 */
async function processMetrics() {
    const processOrder = loadProcessOrder('./data/processOrder.json'); // Load process order data
    const plannedDowntime = await getPlannedDowntime(); // Load planned downtime data asynchronously

    // Calculate total planned downtime for the specified process order
    const totalPlannedDowntime = calculateTotalPlannedDowntime(
        plannedDowntime,
        processOrder.ProcessOrderStart,
        processOrder.ProcessOrderEnd,
        processOrder.LineCode
    );

    // Update planned downtime metric in the OEECalculator instance
    oeeCalculator.updateData('plannedDowntime', totalPlannedDowntime);
    oeeLogger.debug(`Total planned downtime: ${totalPlannedDowntime}`); // Log total planned downtime

    try {
        await oeeCalculator.calculateMetrics(); // Calculate OEE metrics using OEECalculator instance
        const { oee, availability, performance, quality } = oeeCalculator.getMetrics(); // Get calculated metrics
        const level = oeeCalculator.classifyOEE(oee / 100); // Classify OEE level based on score

        // Log calculated metrics and OEE level
        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        // Prepare payload for MQTT or other communication protocols
        const oeePayload = {
            timestamp: Date.now(),
            metrics: [
                { name: 'oee', value: oeeAsPercent ? oee : oee / 100, type: 'Float' },
                { name: 'availability', value: oeeAsPercent ? availability * 100 : availability, type: 'Float' },
                { name: 'performance', value: oeeAsPercent ? performance * 100 : performance, type: 'Float' },
                { name: 'quality', value: oeeAsPercent ? quality * 100 : quality, type: 'Float' }
            ]
        };

        // Publish OEE payload via MQTT (assumed implementation)
        // client.publish(`spBv1.0/${metadata.group_id}/DDATA/${metadata.edge_node_id}/OEE`, getSparkplugPayload('spBv1.0').encodePayload(oeePayload));

        // Write metrics to InfluxDB if InfluxDB configuration is provided
        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(oee, availability, performance, quality, { group_id: structure.Group_id, edge_node_id: structure.edge_node_id });
        }
    } catch (error) {
        errorLogger.error(`Error calculating metrics: ${error.message}`); // Log error if metric calculation fails
    }
}

module.exports = { updateMetric, processMetrics }; // Export updateMetric and processMetrics functions