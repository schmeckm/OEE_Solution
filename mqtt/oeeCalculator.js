const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const logger = require('../utils/logger');
const { influxdb, oeeAsPercent } = require('../config/config');

let writeApi = null;

if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
    const influxDB = new InfluxDB({ url: influxdb.url, token: influxdb.token });
    writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);
}

function calculateOEE(data) {
    const availability = data.runtime / data.plannedProduction;
    const performance = data.actualPerformance / data.targetPerformance;
    const quality = data.goodProducts / data.totalProduction;
    const oee = availability * performance * quality * 100;

    data.oee = oee;
    data.availability = availability;
    data.performance = performance;
    data.quality = quality;

    return { oee, availability, performance, quality };
}

function writeOEEToInfluxDB(oee, availability, performance, quality, metadata) {
    if (writeApi) {
        const point = new Point('oee')
            .tag('plant', metadata.group_id)
            .tag('area', 'Packaging')
            .tag('line', metadata.edge_node_id);

        // Dynamisch Metadaten als Tags hinzufügen
        Object.keys(metadata).forEach(key => {
            if (typeof metadata[key] !== 'object') {
                point.tag(key, metadata[key]);
            }
        });

        point
            .floatField('oee', oeeAsPercent ? oee : oee / 100)
            .floatField('availability', oeeAsPercent ? availability * 100 : availability)
            .floatField('performance', oeeAsPercent ? performance * 100 : performance)
            .floatField('quality', oeeAsPercent ? quality * 100 : quality);

        writeApi.writePoint(point);

        writeApi.flush().catch(err => {
            logger.error(`Error writing to InfluxDB: ${err}`);
        });
    }
}

module.exports = { calculateOEE, writeOEEToInfluxDB };