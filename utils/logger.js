const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // Load environment variables

// Define log format
const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length) {
        logMessage += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    return logMessage;
});

// Get log levels from environment variable or default to 'debug'
const logLevels = (process.env.LOG_LEVELS || 'debug').split(',');

// Custom filter to include only specified log levels
const customFilter = winston.format((info, opts) => {
    return logLevels.includes(info.level) ? info : false;
});

// Function to create a logger with daily rotating file transport
const createLogger = (logFilename) => {
    return winston.createLogger({
        level: 'debug', // Set the base level to debug to capture all logs, filtering is done by custom filter
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    customFilter(), // Apply the custom filter
                    winston.format.colorize(),
                    logFormat
                )
            }),
            new DailyRotateFile({
                filename: path.join(__dirname, '../logs', `${logFilename}-%DATE%.log`),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ],
        exceptionHandlers: [
            new DailyRotateFile({
                filename: path.join(__dirname, '../logs', 'exceptions-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ],
        rejectionHandlers: [
            new DailyRotateFile({
                filename: path.join(__dirname, '../logs', 'rejections-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ]
    });
};

// Create loggers for different purposes
const oeeLogger = createLogger('oee');
const errorLogger = createLogger('error');
const defaultLogger = createLogger('app');
const unplannedDowntimeLogger = createLogger('unplannedDowntime'); // New logger for unplannedDowntime.json content

// Function to log content of unplannedDowntime.json
function logUnplannedDowntimeFileContent() {
    try {
        const dataDirectory = path.join(__dirname, '..', 'data');
        const dbFilePath = path.join(dataDirectory, 'unplannedDowntime.json');

        if (fs.existsSync(dbFilePath)) {
            const machineDataContent = fs.readFileSync(dbFilePath, 'utf8');
            const machineData = JSON.parse(machineDataContent);
            unplannedDowntimeLogger.info('Content of unplannedDowntime.json:', { data: machineData });
            console.log('Content of unplannedDowntime.json:');
            console.log(machineData);
        } else {
            unplannedDowntimeLogger.warn('unplannedDowntime.json does not exist or could not be read.');
            console.log('unplannedDowntime.json does not exist or could not be read.');
        }
    } catch (error) {
        unplannedDowntimeLogger.error(`Error logging unplannedDowntime.json content: ${error.message}`);
    }
}

module.exports = {
    oeeLogger,
    errorLogger,
    defaultLogger,
    unplannedDowntimeLogger,
    logUnplannedDowntimeFileContent
};