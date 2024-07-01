process.on('uncaughtException', function(err) {
    console.error('Uncaught Exception:', err.message);
    console.error(err.stack);
    process.exit(1); //optional (do not exit if you want to keep the process running)
});

process.on('unhandledRejection', function(reason, p) {
    console.error('Unhandled Rejection:', reason);
});

const dotenv = require('dotenv');
dotenv.config(); // Load environment variables from the .env file at the beginning

const express = require('express');
const path = require('path');
const cron = require('node-cron');
const logger = require('./utils/logger'); // Import logger for consistent logging
const { logRetentionDays } = require('./config/config'); // Import configuration settings
const { setupMqttClient } = require('./mqtt/mqttClient'); // Import MQTT client setup function
const { handleErrors } = require('./utils/middleware'); // Import error handling middleware

const app = express(); // Create an Express application
const port = process.env.PORT || 3000; // Define the port to listen on, default to 3000

// Validate essential configurations
if (!process.env.PORT) {
    logger.warn('PORT is not defined in the environment variables, defaulting to 3000');
}
if (!logRetentionDays) {
    logger.warn('logRetentionDays is not defined in the configuration, defaulting to some sensible value');
}

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/oeeConfig', require('./routes/oeeConfig')); // Route for OEE configuration
app.use('/structure', require('./routes/structure')); // Route for structure configuration
app.use('/oee-logs', require('./routes/oeeLogs')); // Route for fetching OEE logs
app.use('/calculateOEE', require('./routes/calculateOEE')); // Route for calculating OEE

// Error handling middleware
app.use(handleErrors);

// Schedule a cron job to clean up old logs every day at midnight
cron.schedule('0 0 * * *', async() => {
    try {
        const { cleanupLogs } = require('./utils/logger'); // Import log cleanup function
        await cleanupLogs(logRetentionDays); // Clean up logs older than the specified retention period
        logger.info('Old logs cleanup job completed successfully.');
    } catch (error) {
        logger.error(`Error during log cleanup job: ${error.message}`);
    }
});

// Setup MQTT client
const mqttClient = setupMqttClient(); // Initialize MQTT client for communication

// Start the Express server
const server = app.listen(port, () => {
    logger.info(`Server is running on port ${port}`); // Log the port the server is running on
});

// Graceful shutdown
function gracefulShutdown(signal) {
    logger.info(`${signal} signal received: closing HTTP server`);
    server.close(() => {
        logger.info('HTTP server closed');
        if (mqttClient) {
            mqttClient.end(() => {
                logger.info('MQTT client disconnected');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));