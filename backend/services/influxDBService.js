// services/influxDBService.js

const { InfluxDB } = require('@influxdata/influxdb-client');
const { defaultLogger, errorLogger } = require('../utils/logger');
const { influxdb } = require('../config/config');

let writeApi;

function initializeInfluxDB() {
    try {
        if (!influxdb.url || !influxdb.token || !influxdb.org || !influxdb.bucket) {
            throw new Error('InfluxDB configuration is incomplete.');
        }
        const influxDB = new InfluxDB({ url: influxdb.url, token: influxdb.token });
        writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);
        defaultLogger.info('InfluxDB client successfully initialized.');
    } catch (error) {
        errorLogger.error(`InfluxDB initialization error: ${error.message}`);
        process.exit(1); // Exit the process if InfluxDB cannot be initialized
    }
}

function getWriteApi() {
    if (!writeApi) {
        throw new Error('InfluxDB write API is not initialized.');
    }
    return writeApi;
}

module.exports = { initializeInfluxDB, getWriteApi };