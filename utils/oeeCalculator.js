const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { oeeLogger, errorLogger } = require('./logger'); // Stellen Sie sicher, dass der Pfad korrekt ist
const { influxdb, oeeAsPercent } = require('../config/config');
const { getPlannedDowntime, calculateTotalPlannedDowntime } = require('../utils/downtimeManager'); // Korrigieren Sie den Pfad

const VALID_SCORE_THRESHOLD = 1.0;
const MINIMUM_SCORE_THRESHOLD = 0.0;
const CLASSIFICATION_LEVELS = {
    WORLD_CLASS: 0.85,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    AVERAGE: 0.4,
};
const DEFAULT_UNPLANNED_DOWNTIME = 600; // 10 Minuten in Sekunden

class OEECalculator {
    constructor() {
        this.oeeData = {
            plannedProduction: 0,
            runtime: 0,
            actualPerformance: 0,
            targetPerformance: 0,
            goodProducts: 0,
            totalProduction: 0,
            unplannedDowntime: DEFAULT_UNPLANNED_DOWNTIME,
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0
        };
    }

    updateData(metric, value) {
        oeeLogger.debug(`Updating ${metric} with value: ${value}`);
        this.oeeData[metric] = value;
    }

    validateInput() {
        const { plannedProduction, runtime, actualPerformance, targetPerformance, goodProducts, totalProduction } = this.oeeData;
        try {
            if (runtime <= 0) {
                const msg = "Invalid input: Operating time must be a positive number.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (runtime > plannedProduction) {
                const msg = "Invalid input: Total operating time cannot exceed planned production time.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (plannedProduction <= 0) {
                const msg = "Invalid input: Planned production time must be a positive number.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (totalProduction < 0 || targetPerformance < 0 || goodProducts < 0) {
                const msg = "Invalid input: Parts counts cannot be negative.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (totalProduction > targetPerformance) {
                const msg = `Invalid input: Total parts produced (${totalProduction}) cannot exceed total parts to be produced (${targetPerformance}).`;
                errorLogger.error(msg);
                throw new Error(msg);
            }
            if (goodProducts > totalProduction) {
                const msg = "Invalid input: Good parts cannot exceed total parts produced.";
                errorLogger.error(msg);
                throw new Error(msg);
            }
            oeeLogger.debug('Input validated successfully.');
        } catch (error) {
            throw error;
        }
    }

    calculateMetrics() {
        try {
            this.validateInput();

            const { plannedProduction, runtime, targetPerformance, goodProducts, totalProduction, unplannedDowntime } = this.oeeData;

            // Wenn keine Werte für ungeplante Ausfallzeit vorhanden sind, standardmäßig 10 Minuten berücksichtigen
            const actualUnplannedDowntime = this.oeeData.unplannedDowntime !== undefined ? this.oeeData.unplannedDowntime : DEFAULT_UNPLANNED_DOWNTIME;

            // Availability
            const operatingTime = runtime - actualUnplannedDowntime;
            if (operatingTime <= 0 || plannedProduction <= 0) {
                throw new Error("Calculated operating time or planned production time is invalid");
            }
            this._availability = operatingTime / plannedProduction;
            oeeLogger.info(`Calculated Availability: ${this._availability}`);

            // Performance
            this._idealCycleTime = plannedProduction / targetPerformance;
            if (operatingTime <= 0) {
                throw new Error("Operating time must be greater than zero for performance calculation");
            }
            this._performance = (this._idealCycleTime * totalProduction) / operatingTime;
            oeeLogger.info(`Calculated Performance: ${this._performance}`);

            // Quality
            if (totalProduction <= 0) {
                throw new Error("Total production must be greater than zero for quality calculation");
            }
            this._quality = goodProducts / totalProduction;
            oeeLogger.info(`Calculated Quality: ${this._quality}`);

            // OEE
            this._oee = this._availability * this._performance * this._quality * 100;
            oeeLogger.info(`Calculated OEE: ${this._oee}`);

            if (!isFinite(this._oee)) {
                const msg = `Calculated OEE is not finite: ${this._oee}`;
                errorLogger.error(msg);
                throw new Error(msg);
            }

        } catch (error) {
            errorLogger.error(`Error during metric calculation: ${error.message}`);
            throw error;
        }
    }

    classifyOEE(score) {
        if (score > VALID_SCORE_THRESHOLD || score < MINIMUM_SCORE_THRESHOLD) {
            const msg = `Invalid input: score must be between ${MINIMUM_SCORE_THRESHOLD} and ${VALID_SCORE_THRESHOLD}`;
            errorLogger.error(msg);
            throw new Error(msg);
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
    errorLogger.error(`InfluxDB initialization error: ${error.message}`);
}

async function writeOEEToInfluxDB(oee, availability, performance, quality, metadata) {
    if (!writeApi) {
        errorLogger.error('InfluxDB write API is not initialized.');
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
        errorLogger.error(`Error writing to InfluxDB: ${error.message}`);
    }
}

module.exports = { OEECalculator, writeOEEToInfluxDB };