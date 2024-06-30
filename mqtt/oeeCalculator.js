const { get: getSparkplugPayload } = require('sparkplug-payload');
const logger = require('../utils/logger');

const calculateOEE = (data, mqttClient) => {
    try {
        const availability = data.runtime / data.plannedProduction;
        const performance = data.actualPerformance / data.targetPerformance;
        const quality = data.goodProducts / data.totalProduction;
        const oee = availability * performance * quality * 100;

        const oeeData = {
            oee: oee,
            availability: availability,
            performance: performance,
            quality: quality
        };

        logger.info(`Calculated OEE: ${oee}%`);
        logger.info(`Availability: ${availability}, Performance: ${performance}, Quality: ${quality}`);

        const sparkplug = getSparkplugPayload('spBv1.0');
        const payload = {
            timestamp: new Date().getTime(),
            metrics: [
                { name: 'OEE', value: oee, type: 'Float' },
                { name: 'availability', value: availability, type: 'Float' },
                { name: 'performance', value: performance, type: 'Float' },
                { name: 'quality', value: quality, type: 'Float' }
            ]
        };
        const encoded = sparkplug.encodePayload(payload);

        const publishTopic = `spBv1.0/Basel/DDATA/Falcon11/OEE`;
        mqttClient.publish(publishTopic, encoded);

        logger.info(`Published OEE data to topic: ${publishTopic}`);
        logger.info(`Published OEE payload: ${JSON.stringify(payload)}`);
    } catch (error) {
        logger.error(`Error calculating OEE: ${error}`);
    }
};

module.exports = {
    calculateOEE
};