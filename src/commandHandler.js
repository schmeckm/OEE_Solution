// CommandHandler.js
const fs = require('fs');
const path = require('path');
const { oeeLogger, logUnplannedDowntimeFileContent } = require('../utils/logger');

// Define paths to data files
const dataDirectory = path.join(__dirname, '..', 'data');
const dbFilePath = path.join(dataDirectory, 'unplannedDowntime.json');
const processOrderDataPath = path.join(dataDirectory, 'processOrder.json');

let currentHoldStatus = {}; // Track current hold status for each ProcessOrderNumber
let processOrderData = null; // Store process order data from processOrder.json

// Function to load process order data from processOrder.json
function loadProcessOrderData() {
    try {
        const processOrderContent = fs.readFileSync(processOrderDataPath, 'utf8');
        processOrderData = JSON.parse(processOrderContent);
        oeeLogger.info(`Process order data loaded from ${processOrderDataPath}`);
    } catch (error) {
        errorLogger.error(`Error loading processOrder.json from ${processOrderDataPath}: ${error.message}`);
        processOrderData = {}; // Set to empty object if loading fails
    }
}

// Load process order data on module start
loadProcessOrderData();

// Handle Hold command
function handleHoldCommand(value) {
    const timestamp = new Date().toISOString();

    oeeLogger.debug(`handleHoldCommand called with value: ${value}`);

    if (value === 1) {
        oeeLogger.info('Machine is on Hold');
        stopMachineOperations();
        logEventToDatabase('Hold', timestamp);
        notifyPersonnel('Machine has been put on hold.');

        if (processOrderData && processOrderData.ProcessOrderNumber) {
            if (!currentHoldStatus[processOrderData.ProcessOrderNumber]) {
                currentHoldStatus[processOrderData.ProcessOrderNumber] = [];
            }
            currentHoldStatus[processOrderData.ProcessOrderNumber].push({ timestamp });

            console.log(`Hold signal recorded in MachineData.json at ${timestamp}`);
        } else {
            console.warn('No valid process order data found. Hold signal ignored.');
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
        if (processOrderData && processOrderData.ProcessOrderNumber) {
            if (currentHoldStatus[processOrderData.ProcessOrderNumber] && currentHoldStatus[processOrderData.ProcessOrderNumber].length > 0) {
                oeeLogger.info('Machine is now Unhold');
                startMachineOperations();
                logEventToDatabase('Unhold', timestamp);
                notifyPersonnel('Machine has been unhold and resumed operations.');

                const holdTimestamp = new Date(currentHoldStatus[processOrderData.ProcessOrderNumber][currentHoldStatus[processOrderData.ProcessOrderNumber].length - 1].timestamp);
                const unholdTimestamp = new Date(timestamp);

                const downtimeMinutes = Math.round((unholdTimestamp - holdTimestamp) / (1000 * 60));

                const machineDataEntry = {
                    "ProcessOrderNumber": processOrderData.ProcessOrderNumber,
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
                    console.log(`Downtime for Order ${processOrderData.ProcessOrderNumber}: ${downtimeMinutes} minutes`);

                    logUnplannedDowntimeFileContent();
                } catch (error) {
                    console.error('Error writing MachineData.json:', error.message);
                }

                currentHoldStatus[processOrderData.ProcessOrderNumber].pop();

                if (currentHoldStatus[processOrderData.ProcessOrderNumber].length === 0) {
                    delete currentHoldStatus[processOrderData.ProcessOrderNumber];
                }
            } else {
                oeeLogger.info('Unhold command received, but no previous Hold signal found.');
                console.log('Current Hold Status:', currentHoldStatus);
            }
        } else {
            console.warn('No valid process order data found. Unhold signal ignored.');
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
        oeeLogger.error(`Error logging event to database: ${error.message}`);
    }
}

function notifyPersonnel(message) {
    oeeLogger.info(`Notifying personnel: ${message}`);
}

module.exports = { handleHoldCommand, handleUnholdCommand };