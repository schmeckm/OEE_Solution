const winston = require('winston'); // Import the winston logging library
const DailyRotateFile = require('winston-daily-rotate-file'); // Import winston-daily-rotate-file for log rotation
const path = require('path');

// Define log format
const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length) {
        logMessage += ` ${JSON.stringify(metadata)}`;
    }
    return logMessage;
});

// Create a new logger instance using winston
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', // Set the logging level based on environment
    format: winston.format.combine(
        winston.format.timestamp(), // Add a timestamp to each log message
        process.env.NODE_ENV === 'production' ? winston.format.json() : logFormat // Use JSON format in production, readable format otherwise
    ),
    transports: [
        // Define the transports (where the logs should be output)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(), // Colorize output for console
                logFormat // Use readable format for console
            )
        }), // Output logs to the console
        new DailyRotateFile({
            filename: path.join('logs', 'oee-calculator-%DATE%.log'), // Log rotation with date in filename
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d', // Keep logs for 14 days
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json() // JSON format for files
            )
        })
    ],
    exceptionHandlers: [
        new DailyRotateFile({
            filename: path.join('logs', 'exceptions-%DATE%.log'), // Log rotation with date in filename for exceptions
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json() // JSON format for files
            )
        })
    ],
    rejectionHandlers: [
        new DailyRotateFile({
            filename: path.join('logs', 'rejections-%DATE%.log'), // Log rotation with date in filename for rejections
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json() // JSON format for files
            )
        })
    ]
});

// Export the logger instance for use in other files
module.exports = logger;