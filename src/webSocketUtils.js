const WebSocket = require('ws');
const { oeeLogger, errorLogger } = require('../utils/logger');
const { loadMachineStoppagesData } = require('../src/dataLoader');

let wss = null;

/**
 * Set the WebSocket server instance.
 * @param {Object} server - The WebSocket server instance.
 */
function setWebSocketServer(server) {
    wss = server;
    wss.on('connection', async(ws) => {
        console.log('Client connected');

        // Send initial machine stoppages data to the newly connected client
        try {
            const machineStoppagesData = loadMachineStoppagesData();
            sendWebSocketMessage('machineData', machineStoppagesData);
            oeeLogger.info('Initial machine stoppages data sent to WebSocket client.');
        } catch (error) {
            errorLogger.error(`Error sending initial machine stoppages data: ${error.message}`);
        }

        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });
}

/**
 * Send data to all connected WebSocket clients with a specified type.
 * @param {Object} wss - The WebSocket server instance.
 * @param {string} type - The type of data being sent.
 * @param {Object} data - The data to send.
 */
function sendWebSocketMessage(type, data) {
    if (wss) {
        const payload = JSON.stringify({ type, data });
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
        oeeLogger.info(`${type} data sent to WebSocket clients.`);
    }
}

module.exports = {
    setWebSocketServer,
    sendWebSocketMessage
};