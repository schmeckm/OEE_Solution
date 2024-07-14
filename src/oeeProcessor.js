const { oeeLogger, errorLogger } = require('../utils/logger');
const { OEECalculator, writeOEEToInfluxDB } = require('../utils/oeeCalculator');
const { getunplannedDowntime, getPlannedDowntime } = require('../utils/downtimeManager');
const { influxdb, oeeAsPercent, structure } = require('../config/config');
const WebSocket = require('ws'); // Import WebSocket

const oeeCalculator = new OEECalculator();
let receivedMetrics = {};
let wss = null; // WebSocket server instance

// Function to set the WebSocket server instance
function setWebSocketServer(server) {
    wss = server;
}

function updateMetric(name, value) {
    receivedMetrics[name] = value;
    oeeCalculator.updateData(name, value);
    oeeLogger.debug(`Metric updated: ${name} = ${value}`);
}

async function processMetrics() {
    try {
        await oeeCalculator.init();
        await oeeCalculator.calculateMetrics();
        const { oee, availability, performance, quality, ProcessOrderNumber, StartTime, EndTime, plannedProduction } = oeeCalculator.getMetrics();
        const level = oeeCalculator.classifyOEE(oee / 100);

        oeeLogger.info(`Calculated Availability: ${availability}`);
        oeeLogger.info(`Calculated Performance: ${performance}`);
        oeeLogger.info(`Calculated Quality: ${quality}`);
        oeeLogger.info(`Calculated OEE: ${oee}% (Level: ${level})`);

        // Calculate downtime
        const plannedDowntime = await getPlannedDowntime(ProcessOrderNumber, StartTime, EndTime);
        const unplannedDowntime = await getunplannedDowntime(ProcessOrderNumber);

        // Prepare payload
        const roundedMetrics = {
            oee: Math.round(oee * 100) / 100,
            availability: Math.round(availability * 10000) / 100,
            performance: Math.round(performance * 10000) / 100,
            quality: Math.round(quality * 10000) / 100,
            level: level,
            processData: {
                ProcessOrderNumber,
                StartTime,
                EndTime,
                plannedProduction,
                plannedDowntime,
                unplannedDowntime
            }
        };

        // Send metrics to all connected WebSocket clients
        if (wss) {
            const payload = JSON.stringify(roundedMetrics);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
        }

        if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
            await writeOEEToInfluxDB(oee, availability, performance, quality, { group_id: structure.Group_id, edge_node_id: structure.edge_node_id });
        }
    } catch (error) {
        errorLogger.error(`Error calculating metrics: ${error.message}`);
    }
}

module.exports = { updateMetric, processMetrics, setWebSocketServer };