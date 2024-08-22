const path = require('path');
const fs = require('fs').promises;

const filePath = path.resolve(__dirname, '../data/unplannedDowntime.json');

async function loadUnplannedDowntime() {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
}

async function saveUnplannedDowntime(data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function getUnplannedDowntimeByProcessOrderNumber(processOrderNumber) {
    const data = await loadUnplannedDowntime();
    return data.filter(downtime => downtime.ProcessOrderNumber === processOrderNumber);
}

async function getUnplannedDowntimeByMachineId(machineId) {
    const data = await loadUnplannedDowntime();
    return data.filter(downtime => downtime.machine_id === machineId);
}

module.exports = {
    loadUnplannedDowntime,
    saveUnplannedDowntime,
    getUnplannedDowntimeByProcessOrderNumber,
    getUnplannedDowntimeByMachineId
};