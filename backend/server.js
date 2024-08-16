/**
 * Module dependencies.
 */
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { Server } = require('ws');

/**
 * Load environment variables from .env file.
 * Ensures that environment-specific configurations are available throughout the application.
 */
dotenv.config();

const { defaultLogger } = require('./utils/logger');
const { logRetentionDays } = require('./config/config');
const { setWebSocketServer } = require('./src/oeeProcessor');
const startLogCleanupJob = require('./cronJobs/logCleanupJob');
const initializeMqttClient = require('./src/mqttClientSetup');
const handleWebSocketConnections = require('./websocket/webSocketHandler');
const gracefulShutdown = require('./src/shutdown');
const registerApiRoutes = require('./routes/apiRoutes'); // Centralized API route registration

const app = express();
const port = process.env.PORT || 3000;

/**
 * Middleware to parse incoming JSON and URL-encoded payloads.
 * - `express.json()`: Parses incoming requests with JSON payloads.
 * - `express.urlencoded()`: Parses incoming requests with URL-encoded payloads.
 * - `express.static()`: Serves static files from the 'public' directory.
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Register API Endpoints
 * Centralized function to register all API routes, including OEE and additional endpoints.
 */
registerApiRoutes(app);

defaultLogger.info('Logger initialized successfully.');

/**
 * Cron Job for Log Cleanup
 * Schedules a daily job to clean up old logs based on the retention policy.
 */
startLogCleanupJob(logRetentionDays);

/**
 * MQTT Client Initialization
 * Initializes the MQTT client for handling MQTT-based communication.
 * Logs success or failure of the initialization.
 */
const mqttClient = initializeMqttClient();

/**
 * HTTP Server Initialization
 * Starts the Express server on the specified port.
 * Logs the success of the server start.
 */
const server = app.listen(port, () => {
    defaultLogger.info(`Server is running on port ${port}`);
});

/**
 * WebSocket Server Setup
 * Initializes the WebSocket server, attaches it to the HTTP server, 
 * and delegates connection handling to a dedicated function.
 */
const wss = new Server({ server });

/**
 * Handle WebSocket Connections
 * Delegates the handling of WebSocket connections, messages, and disconnections 
 * to an external handler function for modularity and clarity.
 */
handleWebSocketConnections(wss);

/**
 * Associate WebSocket Server with OEE Processor
 * Sets the WebSocket server instance within the OEE processor for 
 * further communication handling.
 */
setWebSocketServer(wss);

/**
 * Graceful Shutdown Handling
 * Listens for termination signals (SIGTERM, SIGINT) to gracefully 
 * shut down the server and disconnect the MQTT client.
 * Ensures that the server closes properly without data loss.
 */
process.on('SIGTERM', () => gracefulShutdown(server, mqttClient, 'SIGTERM'));
process.on('SIGINT', () => gracefulShutdown(server, mqttClient, 'SIGINT'));