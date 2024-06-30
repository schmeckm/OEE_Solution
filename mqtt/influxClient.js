const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { influxdb } = require('../config/config');

const influxDB = new InfluxDB({
    url: influxdb.url,
    token: influxdb.token
});

const writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);
writeApi.useDefaultTags({ host: 'host1' });

const writePoint = (measurement, fields, tags = {}) => {
    const point = new Point(measurement);
    Object.keys(fields).forEach(key => {
        point.floatField(key, fields[key]);
    });
    Object.keys(tags).forEach(key => {
        point.tag(key, tags[key]);
    });
    writeApi.writePoint(point);
};

module.exports = {
    writePoint
};