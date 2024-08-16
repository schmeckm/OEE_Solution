const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
require('dotenv').config(); // Load the .env file

const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length) {
        logMessage += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    return logMessage;
});

const logLevels = (process.env.LOG_LEVELS || 'debug').split(',').map(level => level.trim());
const retentionDays = process.env.LOG_RETENTION_DAYS || 14;
const logToConsole = process.env.LOG_TO_CONSOLE === 'true';
const logToFile = process.env.LOG_TO_FILE === 'true';

/**
 * Custom filter for log levels.
 * @param {Object} info - Log information.
 * @returns {Object|boolean} Log information or false if the level is not included.
 */
const customFilter = winston.format((info) => logLevels.includes(info.level) ? info : false);

/**
 * Helper function to create a log transport.
 * @param {string} type - Type of transport ('console' or 'file').
 * @param {string} [filename] - Filename for file transport.
 * @returns {Object} - Configured transport.
 */
const createTransport = (type, filename) => {
    if (type === 'console' && logToConsole) {
        return new winston.transports.Console({
            format: winston.format.combine(
                customFilter(),
                winston.format.colorize(),
                winston.format.timestamp(),
                logFormat
            )
        });
    }

    if (type === 'file' && logToFile) {
        return new DailyRotateFile({
            filename: path.join(__dirname, `../logs/${filename}-%DATE%.log`),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: `${retentionDays}d`,
            format: winston.format.combine(
                customFilter(),
                winston.format.timestamp(),
                logFormat
            )
        });
    }

    return null;
};

/**
 * Helper function to create exception and rejection handlers.
 * @param {string} name - Type of handler ('exceptions' or 'rejections').
 * @returns {Array} - Configured handlers.
 */
const createHandlers = (name) => [
    new DailyRotateFile({
        filename: path.join(__dirname, `../logs/${name}-%DATE%.log`),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: `${retentionDays}d`,
        format: winston.format.combine(
            customFilter(),
            winston.format.timestamp(),
            logFormat
        )
    })
];

/**
 * Creates a Winston logger.
 * @param {string} logFilename - Name of the log file.
 * @returns {Object} Winston logger.
 */
const createLogger = (logFilename = 'app') => {
    const transports = [
        createTransport('console'),
        createTransport('file', logFilename)
    ].filter(Boolean); // Filter out null transports

    return winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports,
        exceptionHandlers: createHandlers('exceptions'),
        rejectionHandlers: createHandlers('rejections')
    });
};

// Create different logger instances for various logging purposes
const oeeLogger = createLogger('oee');
const errorLogger = createLogger('error');
const defaultLogger = createLogger();
const unplannedDowntimeLogger = createLogger('unplannedDowntime');

module.exports = {
    oeeLogger,
    errorLogger,
    defaultLogger,
    unplannedDowntimeLogger
};