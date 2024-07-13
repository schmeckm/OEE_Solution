const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length) {
        logMessage += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    return logMessage;
});

const logLevels = (process.env.LOG_LEVELS || 'debug').split(',').map(level => level.trim());

const customFilter = winston.format((info) => {
    return logLevels.includes(info.level) ? info : false;
});

const createLogger = (logFilename) => {
    return winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    customFilter(),
                    winston.format.colorize(),
                    logFormat
                )
            }),
            new DailyRotateFile({
                filename: path.join(__dirname, '../logs', `${logFilename}-%DATE%.log`),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: `${process.env.LOG_RETENTION_DAYS || 14}d`,
                format: winston.format.combine(
                    customFilter(),
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
                maxFiles: `${process.env.LOG_RETENTION_DAYS || 14}d`,
                format: winston.format.combine(
                    customFilter(),
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
                maxFiles: `${process.env.LOG_RETENTION_DAYS || 14}d`,
                format: winston.format.combine(
                    customFilter(),
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ]
    });
};

const oeeLogger = createLogger('oee');
const errorLogger = createLogger('error');
const defaultLogger = createLogger('app');
const unplannedDowntimeLogger = createLogger('unplannedDowntime');

module.exports = {
    oeeLogger,
    errorLogger,
    defaultLogger,
    unplannedDowntimeLogger
};