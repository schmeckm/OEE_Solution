const { oeeLogger } = require('../utils/logger');

function handleHoldCommand(value) {
    if (value === 1) {
        oeeLogger.info('Machine is on Hold');
        // Additional logic for Hold command
    } else {
        oeeLogger.info('Hold command received, but value is not 1');
    }
}

function handleUnholdCommand(value) {
    if (value === 1) {
        oeeLogger.info('Machine is now Unheld');
        // Additional logic for Unhold command
    } else {
        oeeLogger.info('Unhold command received, but value is not 1');
    }
}

module.exports = { handleHoldCommand, handleUnholdCommand };