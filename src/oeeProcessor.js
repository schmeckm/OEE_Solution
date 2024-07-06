const { oeeLogger, errorLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../utils/oeeCalculator');
const { getPlannedDowntime, calculateTotalPlannedDowntime } = require('../utils/downtimeManager');
const { loadProcessOrder } = require('../utils/processOrderManager');
const oeeConfig = require('../config/oeeConfig.json');
const { influxdb, oeeAsPercent, structure } = require('../config/config');

const oeeCalculator = new OEECalculator();
let receivedMetrics = {};

function updateMetric(name, value) {
    receivedMetrics[name] = value;
    oeeCalculator.updateData(name, value);
}

async function processMetrics() {
    const processOrder = loadProcessOrder('./data/processOrder.json');
    const plannedDowntime = await getPlannedDowntime();

    const totalPlannedDowntime = calculateTotalPlannedDowntime(
        plannedDowntime,
        processOrder.ProcessOrderStart,
        processOrder.ProcessOrderEnd,
        processOrder.LineCode
    );
    oeeCalculator.updateData('plannedDowntime', totalPlannedDowntime);
    oeeLogger.debug(`Total planned downtime: ${totalPlannedDowntime}`);

    try {
        oeeCalculator.calculateMetrics();
        const { oee, availability, performance, quality } = oeeCalculator.getMetrics();
        const level = oeeCalculator.classifyOEE(oee / 100);

        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        const oeePayload = {
            timestamp: Date.now(),
            metrics: [
                { name: 'oee', value: oeeAsPercent ? oee : oee / 100, type: 'Float' },
                { name: 'availability', value: oeeAsPercent ? availability * 100 : availability, type: 'Float' },
                { name: 'performance', value: oeeAsPercent ? performance * 100 : performance, type: 'Float' },
                { name: 'quality', value: oeeAsPercent ? quality * 100 : quality, type: 'Float' }
            ]
        };

        // Assuming you have the MQTT client available here to publish the OEE payload
        // client.publish(`spBv1.0/${metadata.group_id}/DDATA/${metadata.edge_node_id}/OEE`, getSparkplugPayload('spBv1.0').encodePayload(oeePayload));

        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            writeOEEToInfluxDB(oee, availability, performance, quality, { group_id: structure.Group_id, edge_node_id: structure.edge_node_id });
        }
    } catch (error) {
        errorLogger.error(`Error calculating metrics: ${error.message}`);
    }
}

module.exports = { updateMetric, processMetrics };