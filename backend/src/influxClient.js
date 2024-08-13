const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { influxdb } = require('../config/config');

// Initialize InfluxDB client with the given URL and token
const influxDB = new InfluxDB({
    url: influxdb.url,
    token: influxdb.token
});

// Get write API for the specified organization and bucket
const writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);

// Use default tags for all points written by this API
writeApi.useDefaultTags({ host: 'host1' });

/**
 * Write a point to InfluxDB
 * 
 * @param {string} measurement - The measurement name
 * @param {Object} fields - The fields to write, with field names as keys and values as field values
 * @param {Object} tags - Optional tags to add to the point, with tag names as keys and values as tag values
 */
/**
 * Writes a data point to InfluxDB.
 * 
 * @param {string} measurement - The measurement name.
 * @param {Object} fields - The fields to be added to the data point.
 * @param {Object} [tags={}] - The tags to be added to the data point.
 * @returns {void}
 */
const writePoint = (measurement, fields, tags = {}) => {
    const point = new Point(measurement);
    // Add fields to the point
    Object.keys(fields).forEach(key => {
        point.floatField(key, fields[key]);
    });
    // Add tags to the point
    Object.keys(tags).forEach(key => {
        point.tag(key, tags[key]);
    });
    // Write the point to InfluxDB
    writeApi.writePoint(point);
};

module.exports = {
    writePoint
};