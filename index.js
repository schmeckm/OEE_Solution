const express = require('express');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');
dotenv.config();

const { defaultLogger } = require('./utils/logger');
const { logRetentionDays } = require('./config/config');
const { setupMqttClient } = require('./src/mqttClient');
const { handleErrors } = require('./utils/middleware');

const app = express();
const port = process.env.PORT || 3000;

process.on('uncaughtException', function(err) {
    console.error('Uncaught Exception:', err.message);
    console.error(err.stack);
    process.exit(1); //optional (do not exit if you want to keep the process running)
});

process.on('unhandledRejection', function(reason, p) {
    console.error('Unhandled Rejection:', reason);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/oeeConfig', require('./routes/oeeConfig'));
app.use('/structure', require('./routes/structure'));
app.use('/oee-logs', require('./routes/oeeLogs'));
app.use('/calculateOEE', require('./routes/calculateOEE'));

app.use(handleErrors);

console.log('Logger initialized:', defaultLogger); // Debugging-Statement

cron.schedule('0 0 * * *', async() => {
    try {
        const { cleanupLogs } = require('./utils/logger');
        await cleanupLogs(logRetentionDays);
        defaultLogger.info('Old logs cleanup job completed successfully.');
    } catch (error) {
        console.error('Error during log cleanup job:', error.message); // Temporäre Fehlerbehebung
        defaultLogger.error(`Error during log cleanup job: ${error.message}`);
    }
});

const mqttClient = setupMqttClient();

const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`); // Temporäre Fehlerbehebung
    defaultLogger.info(`Server is running on port ${port}`);
});

function gracefulShutdown(signal) {
    console.log(`${signal} signal received: closing HTTP server`); // Temporäre Fehlerbehebung
    defaultLogger.info(`${signal} signal received: closing HTTP server`);
    server.close(() => {
        console.log('HTTP server closed'); // Temporäre Fehlerbehebung
        defaultLogger.info('HTTP server closed');
        if (mqttClient) {
            mqttClient.end(() => {
                console.log('MQTT client disconnected'); // Temporäre Fehlerbehebung
                defaultLogger.info('MQTT client disconnected');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));