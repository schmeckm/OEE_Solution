const dotenv = require('dotenv');
dotenv.config(); // Laden Sie die Umgebungsvariablen sofort zu Beginn
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const cron = require('node-cron');
const { logRetentionDays } = require('./config/config');
const { setupMqttClient } = require('./mqtt/mqttClient');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/oee-logs', (req, res) => {
    fs.readFile('oee-calculator.log', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading log file' });
        }
        const logs = data.split('\n').filter(line => line).map(line => {
            try {
                return JSON.parse(line);
            } catch (err) {
                return null;
            }
        }).filter(log => log !== null);
        const lastLogs = logs.slice(-10);
        res.json(lastLogs);
    });
});

app.get('/structure', (req, res) => {
    fs.readFile(path.join(__dirname, 'config', 'structure.json'), 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading structure.json');
            return;
        }
        res.send(data);
    });
});

app.post('/structure', (req, res) => {
    const newData = JSON.stringify(req.body, null, 2);
    fs.writeFile(path.join(__dirname, 'config', 'structure.json'), newData, 'utf8', (err) => {
        if (err) {
            res.status(500).json({ message: 'Error saving structure.json' });
            return;
        }
        res.json({ message: 'structure.json saved successfully' });
    });
});

app.get('/oeeConfig', (req, res) => {
    fs.readFile(path.join(__dirname, 'config', 'oeeConfig.json'), 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading oeeConfig.json');
            return;
        }
        res.send(data);
    });
});

app.post('/oeeConfig', (req, res) => {
    const newData = JSON.stringify(req.body, null, 2);
    fs.writeFile(path.join(__dirname, 'config', 'oeeConfig.json'), newData, 'utf8', (err) => {
        if (err) {
            res.status(500).json({ message: 'Error saving oeeConfig.json' });
            return;
        }
        res.json({ message: 'oeeConfig.json saved successfully' });
    });
});

cron.schedule('0 0 * * *', () => {
    const logFilePath = 'oee-calculator.log';
    const retentionPeriod = logRetentionDays * 24 * 60 * 60 * 1000;
    const currentTime = new Date().getTime();

    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading log file:', err);
            return;
        }

        const logs = data.split('\n').filter(line => line).map(line => {
            try {
                return JSON.parse(line);
            } catch (err) {
                return null;
            }
        }).filter(log => log !== null);
        const filteredLogs = logs.filter(log => {
            const logTime = new Date(log.timestamp).getTime();
            return (currentTime - logTime) < retentionPeriod;
        });

        const newLogData = filteredLogs.map(log => JSON.stringify(log)).join('\n');
        fs.writeFile(logFilePath, newLogData, 'utf8', err => {
            if (err) {
                console.error('Error writing to log file:', err);
            } else {
                console.log('Old logs deleted successfully');
            }
        });
    });
});

const mqttClient = setupMqttClient();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});