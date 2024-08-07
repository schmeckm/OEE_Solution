const express = require('express'); // Import the express module
const path = require('path'); // Import the path module
const fs = require('fs').promises; // Import the fs module with promises API

const router = express.Router(); // Create a new router object
const structurePath = path.join(__dirname, '../config/structure.json'); // Define the path to the structure configuration file

/**
 * GET route to fetch the structure configuration.
 * Reads the configuration from the structure.json file and sends it as a response.
 */
router.get('/', async(req, res, next) => {
    try {
        const data = await fs.readFile(structurePath, 'utf8'); // Read the structure configuration file
        res.send(data); // Send the file content as a response
    } catch (error) {
        next(error); // Pass any errors to the error handler middleware
    }
});

/**
 * POST route to update the structure configuration.
 * Writes the new configuration to the structure.json file.
 */
router.post('/', async(req, res, next) => {
    try {
        const newData = JSON.stringify(req.body, null, 2); // Convert the request body to a formatted JSON string
        await fs.writeFile(structurePath, newData, 'utf8'); // Write the new data to the structure configuration file
        res.json({ message: 'structure.json saved successfully' }); // Send a success message as a response
    } catch (error) {
        next(error); // Pass any errors to the error handler middleware
    }
});

module.exports = router; // Export the router object for use in other files