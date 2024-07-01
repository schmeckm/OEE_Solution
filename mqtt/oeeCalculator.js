const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const logger = require('../utils/logger');
const { influxdb, oeeAsPercent } = require('../config/config');

const VALID_SCORE_THRESHOLD = 1.0;
const MINIMUM_SCORE_THRESHOLD = 0.0;
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: 0.85,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    AVERAGE: 0.4,
};

class OEECalculator {
    constructor() {
        this.oeeData = {
            plannedProduction: 0,
            runtime: 0,
            actualPerformance: 0,
            targetPerformance: 0,
            goodProducts: 0,
            totalProduction: 0,
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0
        };
    }

    updateData(metric, value) {
        this.oeeData[metric] = value;
    }

    validateInput() {
        const { plannedProduction, runtime, actualPerformance, targetPerformance, goodProducts, totalProduction } = this.oeeData;
        if (runtime <= 0) {
            throw new Error("Invalid input: Operating time must be a positive number.");
        }
        if (runtime > plannedProduction) {
            throw new Error("Invalid input: Total operating time cannot exceed planned production time.");
        }
        if (plannedProduction <= 0) {
            throw new Error("Invalid input: Planned production time must be a positive number.");
        }
        if (totalProduction < 0 || targetPerformance < 0 || goodProducts < 0) {
            throw new Error("Invalid input: Parts counts cannot be negative.");
        }
        if (totalProduction > targetPerformance) {
            throw new Error("Invalid input: Total parts produced cannot exceed total parts to be produced.");
        }
        if (goodProducts > totalProduction) {
            throw new Error("Invalid input: Good parts cannot exceed total parts produced.");
        }
    }

    calculateMetrics() {
        this.validateInput();

        const { plannedProduction, runtime, actualPerformance, targetPerformance, goodProducts, totalProduction } = this.oeeData;
        this._operatingTime = runtime;
        this._plannedProductionTime = plannedProduction;
        this._totalPartsProduced = totalProduction;
        this._totalPartsToBeProduced = targetPerformance;
        this._goodParts = goodProducts;
        this._rejectedParts = totalProduction - goodProducts;
        this._downtime = plannedProduction - runtime;
        this._availability = runtime / plannedProduction;
        this._idealCycleTime = plannedProduction / targetPerformance;
        this._performance = (this._idealCycleTime * totalProduction) / runtime;
        this._quality = goodProducts / totalProduction;
        this._oee = this._availability * this._performance * this._quality * 100;

        if (!isFinite(this._oee)) {
            throw new Error(`Calculated OEE is not finite: ${this._oee}`);
        }
    }

    classifyOEE(score) {
        if (score > VALID_SCORE_THRESHOLD || score < MINIMUM_SCORE_THRESHOLD) {
            throw new Error(`Invalid input: score must be between ${MINIMUM_SCORE_THRESHOLD} and ${VALID_SCORE_THRESHOLD}`);
        }
        if (score >= CLASSIFICATION_LEVELS.WORLD_CLASS) return "World Class";
        if (score >= CLASSIFICATION_LEVELS.EXCELLENT) return "Excellent";
        if (score >= CLASSIFICATION_LEVELS.GOOD) return "Good";
        if (score >= CLASSIFICATION_LEVELS.AVERAGE) return "Average";
        return "Poor";
    }

    getMetrics() {
        return {
            oee: this._oee,
            availability: this._availability,
            performance: this._performance,
            quality: this._quality,
        };
    }
}

let writeApi = null;

try {
    if (influxdb.url && influxdb.token && influxdb.org && influxdb.bucket) {
        const influxDB = new InfluxDB({ url: influxdb.url, token: influxdb.token });
        writeApi = influxDB.getWriteApi(influxdb.org, influxdb.bucket);
    } else {
        throw new Error('InfluxDB configuration is incomplete.');
    }
} catch (error) {
    logger.error(`InfluxDB initialization error: ${error.message}`);
}

async function writeOEEToInfluxDB(oee, availability, performance, quality, metadata) {
    if (!writeApi) {
        logger.error('InfluxDB write API is not initialized.');
        return;
    }

    try {
        const point = new Point('oee')
            .tag('plant', metadata.group_id)
            .tag('area', 'Packaging')
            .tag('line', metadata.edge_node_id);

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
        await writeApi.flush();
    } catch (error) {
        logger.error(`Error writing to InfluxDB: ${error.message}`);
    }
}

module.exports = { OEECalculator, writeOEEToInfluxDB };