const path = require('path');
const fs = require('fs').promises;

// Load JSON data from a file
const loadJsonFile = async(filePath) => {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
};

// Generate topics based on machine and OEE configuration
const generateTopics = async(plant, area, line) => {
    const machineFilePath = path.resolve(__dirname, '../data/machine.json');
    const oeeConfigFilePath = path.resolve(__dirname, '../config/oeeConfig.json');

    const machines = await loadJsonFile(machineFilePath);
    const oeeConfig = await loadJsonFile(oeeConfigFilePath);

    const topics = [];

    machines.forEach(machine => {
        // Filter based on Plant, Area, and Line
        if ((plant && machine.Plant !== plant) ||
            (area && machine.area !== area) ||
            (line && machine.name !== line)) {
            return;
        }

        // Iterate over all metrics in OEE config
        Object.keys(oeeConfig).forEach(metric => {
            const topic = `spBv1.0/${machine.Plant}/${machine.area}/DCMD/${machine.name}/${metric}`;
            topics.push(topic);
        });
    });

    return topics;
};

module.exports = { generateTopics };