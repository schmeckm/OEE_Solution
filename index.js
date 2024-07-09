const express = require('express');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');
dotenv.config();

const { defaultLogger, errorLogger } = require('./utils/logger');
const { logRetentionDays } = require('./config/config');
const { setupMqttClient } = require('./src/mqttClient');
const { handleErrors } = require('./utils/middleware');

const app = express();
const port = process.env.PORT || 3000;

// Handle uncaught exceptions and log the error
process.on('uncaughtException', function(err) {
    errorLogger.error('Uncaught Exception:', err.message);
    errorLogger.error(err.stack);
    process.exit(1); // Optional: Exit the process after logging the error
});

// Handle unhandled promise rejections and log the reason
process.on('unhandledRejection', function(reason, p) {
    errorLogger.error('Unhandled Rejection:', reason);
});

// Middleware to parse incoming JSON and URL-encoded payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory

// Define routes for different functionalities
app.use('/structure', require('./routes/structure'));
app.use('/oee-logs', require('./routes/oeeLogs'));
app.use('/calculateOEE', require('./routes/calculateOEE'));

// Error handling middleware
app.use(handleErrors);

defaultLogger.info('Logger initialized successfully.'); // Debugging statement

// Schedule a cron job to clean up old logs daily at midnight
cron.schedule('0 0 * * *', async() => {
    try {
        const { cleanupLogs } = require('./utils/logger');
        await cleanupLogs(logRetentionDays);
        defaultLogger.info('Old logs cleanup job completed successfully.');
    } catch (error) {
        errorLogger.error('Error during log cleanup job:', error.message); // Detailed error logging
    }
});

// Initialize and set up the MQTT client
let mqttClient;
try {
    mqttClient = setupMqttClient();
    defaultLogger.info('MQTT client initialized successfully.');
} catch (error) {
    errorLogger.error('Error initializing MQTT client:', error.message);
}

// Start the HTTP server and listen on the specified port
const server = app.listen(port, () => {
    defaultLogger.info(`Server is running on port ${port}`);
});

// Function to handle graceful shutdown of the server
function gracefulShutdown(signal) {
    defaultLogger.info(`${signal} signal received: closing HTTP server`);
    server.close(() => {
        defaultLogger.info('HTTP server closed');
        if (mqttClient) {
            mqttClient.end(() => {
                defaultLogger.info('MQTT client disconnected');
                process.exit(0); // Exit the process after closing the MQTT client
            });
        } else {
            process.exit(0); // Exit the process immediately if there is no MQTT client
        }
    });
}

// Listen for termination signals to gracefully shut down the server
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));