const fs = require('fs');
const path = require('path');
const { oeeLogger, logUnplannedDowntimeFileContent } = require('../utils/logger'); // Importiere den Logger und die Funktion

// Define paths to data files
const dataDirectory = path.join(__dirname, '..', 'data');
const dbFilePath = path.join(dataDirectory, 'unplannedDowntime.json');
const processOrderDataPath = path.join(dataDirectory, 'processOrder.json');

// Initialize variables
let currentHoldStatus = {}; // Track current hold status for each ProcessOrderNumber
let processOrderData = null; // Store process order data from processOrder.json

// Function to load process order data from processOrder.json
function loadProcessOrderData() {
    try {
        const processOrderContent = fs.readFileSync(processOrderDataPath, 'utf8');
        processOrderData = JSON.parse(processOrderContent);
    } catch (error) {
        console.error('Error loading processOrder.json:', error.message);
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
        stopMachineOperations(); // Function to stop machine operations (implement as needed)
        logEventToDatabase('Hold', timestamp); // Function to log event to database (implement as needed)
        notifyPersonnel('Machine has been put on hold.');

        // Check if processOrderData is valid and has ProcessOrderNumber
        if (processOrderData && processOrderData.ProcessOrderNumber) {
            // Initialize hold status array if not existent for current ProcessOrderNumber
            if (!currentHoldStatus[processOrderData.ProcessOrderNumber]) {
                currentHoldStatus[processOrderData.ProcessOrderNumber] = [];
            }
            // Record hold timestamp in currentHoldStatus
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
        // Check if processOrderData is valid and has ProcessOrderNumber
        if (processOrderData && processOrderData.ProcessOrderNumber) {
            // Check if there is a previous Hold signal recorded
            if (currentHoldStatus[processOrderData.ProcessOrderNumber] && currentHoldStatus[processOrderData.ProcessOrderNumber].length > 0) {
                oeeLogger.info('Machine is now Unhold');
                startMachineOperations(); // Function to start machine operations (implement as needed)
                logEventToDatabase('Unhold', timestamp); // Function to log event to database (implement as needed)
                notifyPersonnel('Machine has been unhold and resumed operations.');

                // Retrieve hold and unhold timestamps
                const holdTimestamp = new Date(currentHoldStatus[processOrderData.ProcessOrderNumber][currentHoldStatus[processOrderData.ProcessOrderNumber].length - 1].timestamp);
                const unholdTimestamp = new Date(timestamp);

                // Calculate downtime in minutes
                const downtimeMinutes = Math.round((unholdTimestamp - holdTimestamp) / (1000 * 60));

                // Create entry for machine data with hold, unhold timestamps, and downtime
                const machineDataEntry = {
                    "ProcessOrderNumber": processOrderData.ProcessOrderNumber,
                    "Start": holdTimestamp.toISOString(),
                    "End": unholdTimestamp.toISOString(),
                    "Differenz": downtimeMinutes
                };

                try {
                    let machineData = [];
                    // Read existing machine data from file
                    if (fs.existsSync(dbFilePath)) {
                        const machineDataContent = fs.readFileSync(dbFilePath, 'utf8');
                        machineData = JSON.parse(machineDataContent);
                    }

                    // Append new machine data entry
                    machineData.push(machineDataEntry);

                    // Write updated machine data back to file
                    fs.writeFileSync(dbFilePath, JSON.stringify(machineData, null, 2), 'utf8');
                    console.log(`Unhold signal recorded in MachineData.json at ${timestamp}`);
                    console.log(`Downtime for Order ${processOrderData.ProcessOrderNumber}: ${downtimeMinutes} minutes`);

                    // After writing to file, log the content of unplannedDowntime.json
                    logUnplannedDowntimeFileContent();
                } catch (error) {
                    console.error('Error writing MachineData.json:', error.message);
                }

                // Remove the last hold status entry
                currentHoldStatus[processOrderData.ProcessOrderNumber].pop();

                // If no more hold entries exist, remove ProcessOrderNumber key from currentHoldStatus
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

// Function to stop machine operations
function stopMachineOperations() {
    oeeLogger.info('Stopping machine operations...');
    // Implement this function as needed to stop machine operations
}

// Function to start machine operations
function startMachineOperations() {
    oeeLogger.info('Starting machine operations...');
    // Implement this function as needed to start machine operations
}

// Function to log event to database
function logEventToDatabase(event, timestamp) {
    try {
        if (!event || !timestamp) {
            throw new Error('Event or timestamp missing or invalid.');
        }

        oeeLogger.info(`Logging event to database: ${event} at ${timestamp}`);
        // Implement this function as needed to log events to database
    } catch (error) {
        oeeLogger.error(`Error logging event to database: ${error.message}`);
    }
}

// Function to notify personnel
function notifyPersonnel(message) {
    oeeLogger.info(`Notifying personnel: ${message}`);
    // Implement this function as needed to notify personnel
}

// Export functions for use in other modules
module.exports = { handleHoldCommand, handleUnholdCommand };