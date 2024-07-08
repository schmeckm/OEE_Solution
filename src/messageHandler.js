// Import required modules and functions from utility files
const { oeeLogger, errorLogger } = require('../utils/logger');
const { processMetrics, updateMetric } = require('./oeeProcessor');
const { handleHoldCommand, handleUnholdCommand } = require('./commandHandler');

/**
 * Processes OEE (Overall Equipment Effectiveness) messages by updating the relevant metrics
 * and triggering the metric processing workflow.
 * 
 * @param {Object} decodedMessage - The decoded message containing OEE metrics.
 *   The structure of decodedMessage should be:
 *   {
 *     metrics: [
 *       { name: 'metricName1', value: metricValue1 },
 *       { name: 'metricName2', value: metricValue2 },
 *       ...
 *     ]
 *   }
 */
function handleOeeMessage(decodedMessage) {
    oeeLogger.debug(`handleOeeMessage called with decodedMessage: ${JSON.stringify(decodedMessage)}`);

    try {
        // Iterate over each metric in the decoded message
        decodedMessage.metrics.forEach(metric => {
            const { name, value } = metric; // Destructure metric properties
            oeeLogger.info(`Received metric: ${name}, Value: ${value}`); // Log received metric
            updateMetric(name, value); // Update the metric in the OEEProcessor
        });

        // Trigger the processing of all updated metrics
        processMetrics();
    } catch (error) {
        errorLogger.error(`Error in handleOeeMessage: ${error.message}`); // Log error message
        errorLogger.error(error.stack); // Log error stack trace for debugging
    }
}

/**
 * Processes command messages by delegating the handling to appropriate command handlers
 * based on the command type.
 * 
 * @param {Object} decodedMessage - The decoded message containing command metrics.
 *   The structure of decodedMessage should be:
 *   {
 *     metrics: [
 *       { name: 'Command/Type', value: commandValue, type: commandType, alias: commandAlias },
 *       ...
 *     ]
 *   }
 */
function handleCommandMessage(decodedMessage) {
    oeeLogger.debug(`handleCommandMessage called with decodedMessage: ${JSON.stringify(decodedMessage)}`);

    try {
        // Validate the format of the decoded message
        if (!decodedMessage || !decodedMessage.metrics || !Array.isArray(decodedMessage.metrics)) {
            throw new Error('Invalid decodedMessage format');
        }

        // Iterate over each command metric in the decoded message
        decodedMessage.metrics.forEach(metric => {
            const { name, value, type, alias } = metric; // Destructure command metric properties
            oeeLogger.info(`Received command: ${name}, Value: ${value}, Type: ${type}, Alias: ${JSON.stringify(alias)}`); // Log received command

            const startTime = Date.now(); // Record the start time of command processing

            // Handle different command types using a switch-case statement
            switch (name) {
                case 'Command/Hold':
                    handleHoldCommand(value); // Handle Hold command
                    break;
                case 'Command/Unhold':
                    handleUnholdCommand(value); // Handle Unhold command
                    break;
                    // Additional commands can be handled here
                default:
                    oeeLogger.warn(`Unknown command: ${name}`); // Log a warning for unknown commands
                    break;
            }

            const endTime = Date.now(); // Record the end time of command processing
            oeeLogger.debug(`Processed command: ${name} in ${endTime - startTime}ms`); // Log the processing time for the command
        });
    } catch (error) {
        errorLogger.error(`Error in handleCommandMessage: ${error.message}`); // Log error message
        errorLogger.error(error.stack); // Log error stack trace for debugging
    }
}

// Export the functions to be used in other modules
module.exports = { handleOeeMessage, handleCommandMessage };