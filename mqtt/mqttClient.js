const mqtt = require('mqtt');
const { get: getSparkplugPayload } = require('sparkplug-payload');
const logger = require('../utils/logger');
const { mqtt: mqttConfig, oeeAsPercent, influxdb, structure, topicFormat } = require('../config/config');
const { OEECalculator, writeOEEToInfluxDB } = require('./oeeCalculator');
const { getPlannedDowntime, calculateTotalPlannedDowntime } = require('./downtimeManager');
const { loadProcessOrder } = require('./processOrderManager');
const oeeConfig = require('../config/oeeConfig.json'); // Load oeeConfig

async function setupMqttClient() {
    logger.info('Setting up MQTT client...');

    const client = mqtt.connect(mqttConfig.brokers.area.url, {
        username: mqttConfig.auth.username,
        password: mqttConfig.auth.password,
        key: mqttConfig.tls.key,
        cert: mqttConfig.tls.cert,
        ca: mqttConfig.tls.ca
    });

    const oeeCalculator = new OEECalculator();

    // Fetch planned downtime from API or JSON file
    let plannedDowntime = [];
    async function fetchPlannedDowntime() {
        try {
            logger.info('Fetching planned downtime...');
            plannedDowntime = await getPlannedDowntime();
            logger.info('Planned downtime fetched successfully');
        } catch (error) {
            logger.error(`Error fetching planned downtime from API: ${error.message}`);
            // Optional: Hier kannst du ein erneutes Versuchen der Verbindung implementieren
            // Beispiel: Versuche es nach 5 Sekunden erneut
            setTimeout(fetchPlannedDowntime, 5000);
            return; // Rückkehr aus der Funktion, um erneutes Aufrufen zu vermeiden
        }
    }

    await fetchPlannedDowntime(); // Initialen Abruf der geplanten Stillstandszeit starten

    // Load process order
    let processOrder = {};
    try {
        logger.info('Loading process order...');
        processOrder = loadProcessOrder('./processOrder.json');
        oeeCalculator.updateData('totalPartsToBeProduced', processOrder.totalPartsToBeProduced);
        logger.info('Process order loaded successfully');
    } catch (error) {
        logger.error(`Error loading process order: ${error.message}`);
    }

    const requiredMetrics = [
        'plannedProduction',
        'runtime',
        'actualPerformance',
        'targetPerformance',
        'goodProducts',
        'totalProduction',
        'unplannedDowntime'
    ];

    let receivedMetrics = {};
    const metadata = {
        group_id: structure.Group_id,
        edge_node_id: structure.edge_node_id,
        device_metadata: structure.device_id[structure.edge_node_id].metadata
    };

    function isAllMetricsReceived() {
        return requiredMetrics.every(metric => metric in receivedMetrics);
    }

    function processMetrics() {
        if (isAllMetricsReceived()) {
            Object.keys(receivedMetrics).forEach(metric => {
                oeeCalculator.updateData(metric, receivedMetrics[metric]);
            });

            // Calculate the total planned downtime within the process order period and matching line code
            const totalPlannedDowntime = calculateTotalPlannedDowntime(
                plannedDowntime,
                processOrder.ProcessOrderStart,
                processOrder.ProcessOrderEnd,
                processOrder.LineCode
            );
            oeeCalculator.updateData('plannedDowntime', totalPlannedDowntime);
            console.log(totalPlannedDowntime);

            const { goodProducts, totalProduction, targetPerformance } = oeeCalculator.oeeData;
            if (goodProducts > totalProduction || totalProduction > targetPerformance) {
                logger.warn(`Invalid state detected: goodProducts (${goodProducts}) > totalProduction (${totalProduction}) or totalProduction (${totalProduction}) > targetPerformance (${targetPerformance}). Skipping calculation.`);
                return;
            }

            try {
                oeeCalculator.calculateMetrics();
                const { oee, availability, performance, quality } = oeeCalculator.getMetrics();
                const level = oeeCalculator.classifyOEE(oee / 100);

                logger.info(`Calculated OEE: ${oee}% (Level: ${level})`);
                logger.info(`Availability: ${availability}, Performance: ${performance}, Quality: ${quality}`);

                const oeePayload = {
                    timestamp: Date.now(),
                    metrics: [
                        { name: 'oee', value: oeeAsPercent ? oee : oee / 100, type: 'Float' },
                        { name: 'availability', value: oeeAsPercent ? availability * 100 : availability, type: 'Float' },
                        { name: 'performance', value: oeeAsPercent ? performance * 100 : performance, type: 'Float' },
                        { name: 'quality', value: oeeAsPercent ? quality * 100 : quality, type: 'Float' }
                    ]
                };
                client.publish(`spBv1.0/${metadata.group_id}/DDATA/${metadata.edge_node_id}/OEE`, getSparkplugPayload('spBv1.0').encodePayload(oeePayload));
                logger.info(`Published OEE payload: ${JSON.stringify(oeePayload)}`);

                if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
                    writeOEEToInfluxDB(oee, availability, performance, quality, {...metadata });
                }
            } catch (error) {
                logger.error(`Error calculating metrics: ${error.message}`);
            }
        }
    }

    client.on('connect', () => {
        logger.info('MQTT client connected');
        Object.keys(oeeConfig).forEach(metric => {
            const topic = `${topicFormat.replace('group_id', structure.Group_id).replace('message_type', 'DDATA').replace('edge_node_id', structure.edge_node_id)}/${metric}`;
            client.subscribe(topic, err => {
                if (!err) {
                    logger.info(`Successfully subscribed to topic: ${topic}`);
                } else {
                    logger.error(`Error subscribing to topic ${topic}: ${err}`);
                }
            });
        });
    });

    client.on('message', (topic, message) => {
        try {
            const sparkplug = getSparkplugPayload('spBv1.0');
            const decodedMessage = sparkplug.decodePayload(message);
            const metric = topic.split('/').pop();
            const value = decodedMessage.metrics[0].value;

            receivedMetrics[metric] = value;

            logger.info(`Decoded message from topic ${topic}: ${JSON.stringify(decodedMessage)}`);
            logger.info(`Updated receivedMetrics: ${JSON.stringify(receivedMetrics)}`);

            processMetrics();
        } catch (error) {
            logger.error(`Error processing message on topic ${topic}: ${error.message}`);
        }
    });

    return client;
}

module.exports = { setupMqttClient };