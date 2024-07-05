const { oeeLogger } = require('../utils/logger');
const { processMetrics, updateMetric } = require('./oeeProcessor');
const { handleHoldCommand, handleUnholdCommand } = require('./commandHandler');

function handleOeeMessage(decodedMessage) {
    decodedMessage.metrics.forEach(metric => {
        const { name, value } = metric;
        oeeLogger.info(`Received metric: ${name}, Value: ${value}`);
        updateMetric(name, value);
        processMetrics();
    });
}

function handleCommandMessage(decodedMessage) {
    decodedMessage.metrics.forEach(metric => {
        const { name, value } = metric;
        oeeLogger.info(`Received command: ${name}, Value: ${value}`);
        if (name === 'Command/Hold') {
            handleHoldCommand(value);
        } else if (name === 'Command/Unhold') {
            handleUnholdCommand(value);
        }
    });
}

module.exports = { handleOeeMessage, handleCommandMessage };