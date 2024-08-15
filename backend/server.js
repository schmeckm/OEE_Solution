/**
 * Module dependencies.
 */
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');
const { Server } = require('ws');
/**
 * Load environment variables from .env file.
 */
dotenv.config();


const { defaultLogger, errorLogger } = require('./utils/logger');
const { logRetentionDays } = require('./config/config');
const { setupMqttClient } = require('./src/mqttClient');
const { handleErrors } = require('./utils/middleware');
const { setWebSocketServer } = require('./src/oeeProcessor');

const app = express();
const port = process.env.PORT || 3000;

/**
 * Middleware to parse incoming JSON and URL-encoded payloads.
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// OEE Routes
const machinesRouter = require('./routes/machines');
const plannedDowntimeRouter = require('./routes/plannedDowntime');
const processOrdersRouter = require('./routes/processOrders');
const shiftModelRouter = require('./routes/shiftModel');
const unplannedDowntimeRouter = require('./routes/unplannedDowntime');
const oeeConfigRouter = require('./routes/oeeConfig');
const microStopsRouter = require('./routes/microstops');

// OEE API Endpoints 
app.use('/api/machines', machinesRouter);
app.use('/api/planneddowntime', plannedDowntimeRouter);
app.use('/api/processorders', processOrdersRouter);
app.use('/api/shiftmodel', shiftModelRouter);
app.use('/api/unplanneddowntime', unplannedDowntimeRouter);
app.use('/api/oeeconfig', oeeConfigRouter);
app.use('/api/microstops', microStopsRouter);
app.use('/structure', require('./routes/structure'));
app.use('/oee-logs', require('./routes/oeeLogs'));
app.use('/calculateOEE', require('./routes/calculateOEE'));
app.use(handleErrors);


defaultLogger.info('Logger initialized successfully.');

// Cron Job for Log Cleanup
cron.schedule('0 0 * * *', async() => {
    try {
        const { cleanupLogs } = require('./utils/logger');
        await cleanupLogs(logRetentionDays);
        defaultLogger.info('Old logs cleanup job completed successfully.');
    } catch (error) {
        errorLogger.error('Error during log cleanup job:', error.message);
    }
});

// MQTT Client Initialization
let mqttClient;
try {
    mqttClient = setupMqttClient();
    defaultLogger.info('MQTT client initialized successfully.');
} catch (error) {
    errorLogger.error('Error initializing MQTT client:', error.message);
}

// HTTP Server Initialization
const server = app.listen(port, () => {
    defaultLogger.info(`Server is running on port ${port}`);
});

// WebSocket Server Setup
const wss = new Server({ server });

wss.on('connection', (ws, req) => {
    defaultLogger.info('WebSocket connection established');

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        defaultLogger.info(`Received message: ${message}`);

        if (parsedMessage.type === 'updateRating') {
            const { ProcessOrderID, ID, Reason } = parsedMessage.data;
            saveRating(ProcessOrderID, ID, Reason, (error, updatedStoppages) => {
                if (error) {
                    errorLogger.error(`Error saving rating: ${error.message}`);
                    return;
                }

                // Broadcast the updated data to all connected clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'Microstops', data: updatedStoppages }));
                    }
                });
            });
        }
    });

    ws.on('close', () => {
        defaultLogger.info('WebSocket connection closed');
    });
});


// Set the WebSocket server instance in oeeProcessor
setWebSocketServer(wss);

/**
 * Function to handle graceful shutdown of the server.
 * @param {string} signal - The signal received
 */
/**
 * Gracefully shuts down the server.
 * 
 * @param {string} signal - The signal received for shutdown.
 */
function gracefulShutdown(signal) {
    defaultLogger.info(`${signal} signal received: closing HTTP server`);
    server.close(() => {
        defaultLogger.info('HTTP server closed');
        if (mqttClient) {
            mqttClient.end(() => {
                defaultLogger.info('MQTT client disconnected');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
}

// Listen for termination signals to gracefully shut down the server
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));