const { oeeLogger, errorLogger } = require('../utils/logger');
const { processMetrics, updateMetric } = require('./oeeProcessor');
const { handleHoldCommand, handleUnholdCommand } = require('./commandHandler');

/**
 * Handles OEE messages by updating metrics and processing them.
 * @param {Object} decodedMessage - The decoded message containing OEE metrics.
 */
function handleOeeMessage(decodedMessage) {
    oeeLogger.debug(`handleOeeMessage called with decodedMessage: ${JSON.stringify(decodedMessage)}`);
    try {
        decodedMessage.metrics.forEach(metric => {
            const { name, value } = metric;
            oeeLogger.info(`Received metric: ${name}, Value: ${value}`);
            updateMetric(name, value);
        });
        processMetrics();
    } catch (error) {
        errorLogger.error(`Error in handleOeeMessage: ${error.message}`);
        errorLogger.error(error.stack);
    }
}

/**
 * Handles command messages by delegating to the appropriate command handler.
 * @param {Object} decodedMessage - The decoded message containing command metrics.
 */
function handleCommandMessage(decodedMessage) {
    oeeLogger.debug(`handleCommandMessage called with decodedMessage: ${JSON.stringify(decodedMessage)}`);
    try {
        if (!decodedMessage || !decodedMessage.metrics || !Array.isArray(decodedMessage.metrics)) {
            throw new Error('Invalid decodedMessage format');
        }

        decodedMessage.metrics.forEach(metric => {
            const { name, value, type, alias } = metric;
            oeeLogger.info(`Received command: ${name}, Value: ${value}, Type: ${type}, Alias: ${JSON.stringify(alias)}`);

            const startTime = Date.now();
            switch (name) {
                case 'Command/Hold':
                    handleHoldCommand(value);
                    break;
                case 'Command/Unhold':
                    handleUnholdCommand(value);
                    break;
                    // Weitere Befehle können hier hinzugefügt werden
                default:
                    oeeLogger.warn(`Unknown command: ${name}`);
                    break;
            }
            const endTime = Date.now();
            oeeLogger.debug(`Processed command: ${name} in ${endTime - startTime}ms`);
        });
    } catch (error) {
        errorLogger.error(`Error in handleCommandMessage: ${error.message}`);
        errorLogger.error(error.stack);
    }
}

module.exports = { handleOeeMessage, handleCommandMessage };