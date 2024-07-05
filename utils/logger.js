const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length) {
        logMessage += ` ${JSON.stringify(metadata)}`;
    }
    return logMessage;
});

const createLogger = (logFilename) => {
    return winston.createLogger({
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    logFormat
                )
            }),
            new DailyRotateFile({
                filename: path.join(__dirname, '../logs', `${logFilename}-%DATE%.log`), // Korrigiert Pfad
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
                filename: path.join(__dirname, '../logs', 'exceptions-%DATE%.log'), // Korrigiert Anführungszeichen
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
                filename: path.join(__dirname, '../logs', 'rejections-%DATE%.log'), // Korrigiert Anführungszeichen
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

// Create different loggers for different purposes
const oeeLogger = createLogger('oee');
const errorLogger = createLogger('error');
const defaultLogger = createLogger('app');

module.exports = {
    oeeLogger,
    errorLogger,
    defaultLogger
};