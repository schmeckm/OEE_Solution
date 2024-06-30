const winston = require('winston'); // Import the winston logging library

// Create a new logger instance using winston
const logger = winston.createLogger({
    level: 'info', // Set the logging level to 'info' (can be 'error', 'warn', 'info', 'verbose', 'debug', 'silly')
    format: winston.format.combine(
        // Combine multiple formatters
        winston.format.timestamp(), // Add a timestamp to each log message
        winston.format.printf(({ level, message, timestamp }) => {
            // Format the log message as a JSON string
            return JSON.stringify({ level, message, timestamp });
        })
    ),
    transports: [
        // Define the transports (where the logs should be output)
        new winston.transports.Console(), // Output logs to the console
        new winston.transports.File({ filename: 'oee-calculator.log' }) // Output logs to a file named 'oee-calculator.log'
    ]
});

// Export the logger instance for use in other files
module.exports = logger;