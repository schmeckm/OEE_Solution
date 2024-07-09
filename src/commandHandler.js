const fs = require('fs');
const path = require('path');
const { oeeLogger, errorLogger, logUnplannedDowntimeFileContent } = require('../utils/logger');
const { loadProcessOrderData, getPlannedDowntime, unplannedDowntime } = require('../src/dataLoader'); // Importing functions to load process orders and downtime data

let currentHoldStatus = {}; // Track current hold status for each ProcessOrderNumber
let processOrderData = null;

// Try to load process order data on module start
try {
    processOrderData = loadProcessOrderData();
    oeeLogger.info(`Process order data loaded: ${JSON.stringify(processOrderData)}`); // Debugging log
    if (processOrderData && processOrderData.length > 0) {
        oeeLogger.info(`Loaded ProcessOrderNumber: ${processOrderData[0].ProcessOrderNumber}`);
    } else {
        oeeLogger.warn('Process order data is empty or undefined.');
    }
} catch (error) {
    errorLogger.error(`Failed to load process order data: ${error.message}`);
}

// Handle Hold command
function handleHoldCommand(value) {
    const timestamp = new Date().toISOString();

    oeeLogger.debug(`handleHoldCommand called with value: ${value}`);

    if (value === 1) {
        oeeLogger.info('Machine is on Hold');
        stopMachineOperations();
        logEventToDatabase('Hold', timestamp);
        notifyPersonnel('Machine has been put on hold.');

        const processOrderNumber = processOrderData && processOrderData[0] && processOrderData[0].ProcessOrderNumber;
        if (processOrderNumber) {
            if (!currentHoldStatus[processOrderNumber]) {
                currentHoldStatus[processOrderNumber] = [];
            }
            currentHoldStatus[processOrderNumber].push({ timestamp });

            console.log(`Hold signal recorded in MachineData.json at ${timestamp}`);
        } else {
            oeeLogger.warn('No valid process order data found. Hold signal ignored.');
        }
    } else {
        oeeLogger.info('Hold command received, but value is not 1');
    }
}

// Handle Unhold command
function handleUnholdCommand(value) {
    const timestamp = new Date().toISOString();

    oeeLogger.debug(`handleUnholdCommand called with value: ${value}`);

    if (value === 1) {
        const processOrderNumber = processOrderData && processOrderData[0] && processOrderData[0].ProcessOrderNumber;
        if (processOrderNumber) {
            if (currentHoldStatus[processOrderNumber] && currentHoldStatus[processOrderNumber].length > 0) {
                oeeLogger.info('Machine is now Unhold');
                startMachineOperations();
                logEventToDatabase('Unhold', timestamp);
                notifyPersonnel('Machine has been unhold and resumed operations.');

                const holdTimestamp = new Date(currentHoldStatus[processOrderNumber][currentHoldStatus[processOrderNumber].length - 1].timestamp);
                const unholdTimestamp = new Date(timestamp);

                const downtimeMinutes = Math.round((unholdTimestamp - holdTimestamp) / (1000 * 60));

                const machineDataEntry = {
                    "ProcessOrderNumber": processOrderNumber,
                    "Start": holdTimestamp.toISOString(),
                    "End": unholdTimestamp.toISOString(),
                    "Differenz": downtimeMinutes
                };

                try {
                    let machineData = [];
                    if (fs.existsSync(dbFilePath)) {
                        const machineDataContent = fs.readFileSync(dbFilePath, 'utf8');
                        machineData = JSON.parse(machineDataContent);
                    }

                    machineData.push(machineDataEntry);

                    fs.writeFileSync(dbFilePath, JSON.stringify(machineData, null, 2), 'utf8');
                    console.log(`Unhold signal recorded in MachineData.json at ${timestamp}`);
                    console.log(`Downtime for Order ${processOrderNumber}: ${downtimeMinutes} minutes`);

                    logUnplannedDowntimeFileContent();
                } catch (error) {
                    console.error('Error writing MachineData.json:', error.message);
                }

                currentHoldStatus[processOrderNumber].pop();

                if (currentHoldStatus[processOrderNumber].length === 0) {
                    delete currentHoldStatus[processOrderNumber];
                }
            } else {
                oeeLogger.info('Unhold command received, but no previous Hold signal found.');
                console.log('Current Hold Status:', currentHoldStatus);
            }
        } else {
            oeeLogger.warn('No valid process order data found. Unhold signal ignored.');
        }
    } else {
        oeeLogger.info('Unhold command received, but value is not 1');
    }
}

function stopMachineOperations() {
    oeeLogger.info('Stopping machine operations...');
}

function startMachineOperations() {
    oeeLogger.info('Starting machine operations...');
}

function logEventToDatabase(event, timestamp) {
    try {
        if (!event || !timestamp) {
            throw new Error('Event or timestamp missing or invalid.');
        }

        oeeLogger.info(`Logging event to database: ${event} at ${timestamp}`);
    } catch (error) {
        errorLogger.error(`Error logging event to database: ${error.message}`);
    }
}

function notifyPersonnel(message) {
    oeeLogger.info(`Notifying personnel: ${message}`);
}

module.exports = { handleHoldCommand, handleUnholdCommand };