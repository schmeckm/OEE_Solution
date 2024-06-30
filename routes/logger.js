const fs = require('fs').promises; // Import fs module with promises API
const logFilePath = 'oee-calculator.log'; // Define the log file path

/**
 * Cleanup logs older than the specified retention period.
 * @param {number} retentionDays - The number of days to retain logs.
 */
async function cleanupLogs(retentionDays) {
    const retentionPeriod = retentionDays * 24 * 60 * 60 * 1000; // Convert retention days to milliseconds
    const currentTime = new Date().getTime(); // Get the current time in milliseconds

    try {
        const data = await fs.readFile(logFilePath, 'utf8'); // Read the log file
        const logs = data.split('\n').filter(line => line).map(line => {
            // Split the file content into lines and filter out empty lines
            try {
                return JSON.parse(line); // Parse each line as JSON
            } catch (err) {
                return null; // If parsing fails, return null
            }
        }).filter(log => log !== null); // Filter out null values (failed parses)

        // Filter logs to keep only those within the retention period
        const filteredLogs = logs.filter(log => {
            const logTime = new Date(log.timestamp).getTime(); // Get log time in milliseconds
            return (currentTime - logTime) < retentionPeriod; // Check if the log is within the retention period
        });

        // Convert the filtered logs back to JSON strings and join them with new lines
        const newLogData = filteredLogs.map(log => JSON.stringify(log)).join('\n');
        await fs.writeFile(logFilePath, newLogData, 'utf8'); // Write the filtered logs back to the file
        console.log('Old logs deleted successfully'); // Log success message
    } catch (err) {
        console.error('Error during log cleanup:', err); // Log any errors that occur during cleanup
    }
}

module.exports = { cleanupLogs }; // Export the cleanupLogs function