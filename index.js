const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const dotenv = require('dotenv');
const sparkplug = require('sparkplug-payload').get("spBv1.0");
const mqtt = require('mqtt');

dotenv.config();

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'oee-calculator.log' })
    ]
});

// Read JSON files
const structurePath = './structure.json';
const oeeConfigPath = './oeeConfig.json';
const envPath = './.env';

let structure = JSON.parse(fs.readFileSync(structurePath, 'utf-8'));
let oeeConfig = JSON.parse(fs.readFileSync(oeeConfigPath, 'utf-8'));

// Express app setup
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.text()); // To handle .env file content
app.use(express.static(path.join(__dirname, 'public')));

app.get('/structure', (req, res) => {
    res.json(structure);
});

app.post('/structure', (req, res) => {
    try {
        structure = JSON.parse(req.body);
        fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2));
        res.json({ message: 'structure.json saved successfully.' });
    } catch (error) {
        res.status(400).json({ message: 'Invalid JSON format' });
    }
});

app.get('/oeeConfig', (req, res) => {
    res.json(oeeConfig);
});

app.post('/oeeConfig', (req, res) => {
    try {
        oeeConfig = JSON.parse(req.body);
        fs.writeFileSync(oeeConfigPath, JSON.stringify(oeeConfig, null, 2));
        res.json({ message: 'oeeConfig.json saved successfully.' });
    } catch (error) {
        res.status(400).json({ message: 'Invalid JSON format' });
    }
});

app.get('/env', (req, res) => {
    res.send(fs.readFileSync(envPath, 'utf-8'));
});

app.post('/env', (req, res) => {
    fs.writeFileSync(envPath, req.body);
    res.json({ message: '.env saved successfully.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});

// Extract relevant details from structure JSON
const OEE_ID = 'Falcon11'; // Edge node ID
const plant = structure.Plant; // Plant name
const device = structure.Device[OEE_ID]; // Device metadata

if (!device) {
    logger.error(`Device with ID "${OEE_ID}" not found in the structure.`);
    process.exit(1);
}

// Construct Group ID
const GROUP_ID = `${plant}`; // Only plant value is used in Group ID

// Configuration object for Sparkplug client
const config = {
    serverUrl: process.env.MQTT_BROKER_URL,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    groupId: GROUP_ID,
    edgeNode: OEE_ID,
    clientId: 'OEE_Calculator_Client',
    version: 'spBv1.0'
};

// Create MQTT client for subscriptions
const mqttOptions = {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
};

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, mqttOptions);

let oeeData = {
    plannedProduction: 0,
    runtime: 0,
    actualPerformance: 0,
    targetPerformance: 0,
    goodProducts: 0,
    totalProduction: 0,
    metadata: device.metadata || {},
    availability: 0,
    performance: 0,
    quality: 0,
    oee: 0
};

mqttClient.on('connect', () => {
    logger.info('Verbunden mit MQTT Broker.');

    // Subscribe to relevant topics dynamically
    const topics = [
        `spBv1.0/${plant}/DDATA/${OEE_ID}/plannedProduction`,
        `spBv1.0/${plant}/DDATA/${OEE_ID}/runtime`,
        `spBv1.0/${plant}/DDATA/${OEE_ID}/actualPerformance`,
        `spBv1.0/${plant}/DDATA/${OEE_ID}/targetPerformance`,
        `spBv1.0/${plant}/DDATA/${OEE_ID}/goodProducts`,
        `spBv1.0/${plant}/DDATA/${OEE_ID}/totalProduction`
    ];

    mqttClient.subscribe(topics, (err, granted) => {
        if (err) {
            logger.error(`Fehler beim Abonnieren der Topics: ${err.message}`);
        } else {
            logger.info(`Erfolgreich abonnierte Topics: ${granted.map(g => g.topic).join(', ')}`);
        }
    });
});

mqttClient.on('message', (topic, message) => {
    logger.info(`Nachricht empfangen auf Topic ${topic}`);

    try {
        const decodedMessage = sparkplug.decodePayload(message);
        decodedMessage.metrics.forEach(metric => {
            const { name, value } = metric;
            oeeData[name] = value;
        });

        // Calculate OEE
        const availability = oeeData.runtime / oeeData.plannedProduction;
        const performance = oeeData.actualPerformance / oeeData.targetPerformance;
        const quality = oeeData.goodProducts / oeeData.totalProduction;
        const oee = availability * performance * quality * 100;

        oeeData.oee = oee;
        oeeData.availability = availability;
        oeeData.performance = performance;
        oeeData.quality = quality;

        logger.info(`Berechnete OEE: ${oee}%`);
        logger.info(`Verfügbarkeit: ${availability}, Leistung: ${performance}, Qualität: ${quality}`);

        // Publish OEE to MQTT
        const oeePayload = {
            timestamp: Date.now(),
            metrics: [
                { name: 'OEE', value: oee, type: 'Float' },
                { name: 'availability', value: availability, type: 'Float' },
                { name: 'performance', value: performance, type: 'Float' },
                { name: 'quality', value: quality, type: 'Float' }
            ]
        };

        mqttClient.publish(`spBv1.0/${plant}/DDATA/${OEE_ID}/oee`, sparkplug.encodePayload(oeePayload));
    } catch (error) {
        logger.error(`Fehler beim Verarbeiten der Nachricht: ${error.message}`);
    }
});

// Handle reconnect event
mqttClient.on('reconnect', () => {
    logger.info('Attempting to reconnect to MQTT broker.');
});

// Handle offline event
mqttClient.on('offline', () => {
    logger.info('Client is offline.');
});

// Handle close event
mqttClient.on('close', () => {
    logger.info('Connection to MQTT broker closed.');
});

// Stop the client
function stopClient() {
    mqttClient.end();
    logger.info('MQTT client stopped.');
}

// Gracefully handle application exit
process.on('SIGINT', () => {
    stopClient();
    process.exit();
});
process.on('SIGTERM', () => {
    stopClient();
    process.exit();
});