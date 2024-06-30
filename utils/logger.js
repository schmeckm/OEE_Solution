const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            return JSON.stringify({ level, message, timestamp });
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'oee-calculator.log' })
    ]
});

module.exports = logger;