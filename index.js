const express = require('express');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');
const { Server } = require('ws'); // WebSocket Server
const fs = require('fs');

dotenv.config();

const { defaultLogger, errorLogger } = require('./utils/logger');
const { logRetentionDays } = require('./config/config');
const { setupMqttClient } = require('./src/mqttClient');
const { handleErrors } = require('./utils/middleware');
const { setWebSocketServer } = require('./src/oeeProcessor'); // Import WebSocket setter

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse incoming JSON and URL-encoded payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory

// Serve index.html at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to get timezone from .env
app.get('/timezone', (req, res) => {
    res.send(process.env.TIMEZONE || 'UTC');
});

// Endpoint to get rating labels
app.get('/ratings', (req, res) => {
    const ratings = [
        { id: 1, description: 'Maintenance', color: 'orange' },
        { id: 2, description: 'Operator Error', color: 'red' },
        { id: 3, description: 'Machine Fault', color: 'blue' },
        { id: 4, description: 'Unknown', color: 'gray' }
    ];
    res.json(ratings);
});

// Endpoint to rate a stoppage
app.post('/rate', (req, res) => {
    const { id, rating } = req.body;
    const machineStoppagesFilePath = path.resolve(__dirname, 'data/machineStoppages.json');

    fs.readFile(machineStoppagesFilePath, 'utf8', (err, data) => {
        if (err) {
            errorLogger.error('Error reading machine stoppages file:', err);
            return res.status(500).send('Error reading machine stoppages file');
        }

        const machineStoppages = JSON.parse(data);
        const stoppage = machineStoppages.find(stoppage => stoppage.ProcessOrderID === id);

        if (stoppage) {
            stoppage.Reason = rating;

            fs.writeFile(machineStoppagesFilePath, JSON.stringify(machineStoppages, null, 2), 'utf8', (err) => {
                if (err) {
                    errorLogger.error('Error writing machine stoppages file:', err);
                    return res.status(500).send('Error writing machine stoppages file');
                }

                defaultLogger.info(`Rating for stoppage ID ${id} updated to ${rating}`);
                res.json(machineStoppages);
            });
        } else {
            errorLogger.error(`Stoppage with ID ${id} not found`);
            res.status(404).send('Stoppage not found');
        }
    });
});

// Define routes for different functionalities
app.use('/structure', require('./routes/structure'));
app.use('/oee-logs', require('./routes/oeeLogs'));
app.use('/calculateOEE', require('./routes/calculateOEE'));

// Error handling middleware
app.use(handleErrors);

defaultLogger.info('Logger initialized successfully.');

// Schedule a cron job to clean up old logs daily at midnight
cron.schedule('0 0 * * *', async() => {
    try {
        const { cleanupLogs } = require('./utils/logger');
        await cleanupLogs(logRetentionDays);
        defaultLogger.info('Old logs cleanup job completed successfully.');
    } catch (error) {
        errorLogger.error('Error during log cleanup job:', error.message);
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

// Secret key for JWT
const SECRET_KEY = 'your_secret_key'; // Replace with your secret key

// Initialize WebSocket server
const wss = new Server({ server });

wss.on('connection', (ws, req) => {
    defaultLogger.info('WebSocket connection established');

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        defaultLogger.info(`Received message: ${message}`);

        if (parsedMessage.type === 'rate') {
            const { id, rating } = parsedMessage;
            // Process the rating and save it to the appropriate place
            saveRating(id, rating);
        }
    });

    ws.on('close', () => {
        defaultLogger.info('WebSocket connection closed');
    });
});

// Function to save rating
function saveRating(id, rating) {
    const machineStoppagesFilePath = path.resolve(__dirname, 'data/machineStoppages.json');
    const machineStoppages = JSON.parse(fs.readFileSync(machineStoppagesFilePath, 'utf8'));

    const stoppage = machineStoppages.find(stoppage => stoppage.ProcessOrderID === id);
    if (stoppage) {
        stoppage.Reason = rating;
        fs.writeFileSync(machineStoppagesFilePath, JSON.stringify(machineStoppages, null, 2), 'utf8');
        defaultLogger.info(`Rating for stoppage ID ${id} updated to ${rating}`);
    } else {
        errorLogger.error(`Stoppage with ID ${id} not found`);
    }
}

// Set the WebSocket server instance in oeeProcessor
setWebSocketServer(wss);

// Function to handle graceful shutdown of the server
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