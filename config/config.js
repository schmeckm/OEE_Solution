const Joi = require('joi');

const structure = require('./structure.json');
const envSchema = Joi.object({
    MQTT_BROKER_URL: Joi.string().uri().required(),
    MQTT_BROKER_PORT: Joi.number().integer().default(1883),
    MQTT_USERNAME: Joi.string().required(),
    MQTT_PASSWORD: Joi.string().required(),
    TLS_KEY: Joi.string().allow(null),
    TLS_CERT: Joi.string().allow(null),
    TLS_CA: Joi.string().allow(null),
    METHOD: Joi.string().default('parris'),
    PORT: Joi.number().integer().default(3000),
    LOG_RETENTION_DAYS: Joi.number().integer().default(2),
    OEE_AS_PERCENT: Joi.boolean().default(true),
    INFLUXDB_URL: Joi.string().allow(null),
    INFLUXDB_TOKEN: Joi.string().allow(null),
    INFLUXDB_ORG: Joi.string().allow(null),
    INFLUXDB_BUCKET: Joi.string().allow(null),
    TOPIC_FORMAT: Joi.string().default('spBv1.0/group_id/message_type/edge_node_id') // Add topic format here
}).unknown().required();

const { error, value: envVars } = envSchema.validate(process.env);
if (error) {
    throw new Error(`Config validation error: ${error.message}`);
}

const tlsKey = envVars.TLS_KEY === 'null' ? null : envVars.TLS_KEY;
const tlsCert = envVars.TLS_CERT === 'null' ? null : envVars.TLS_CERT;
const tlsCa = envVars.TLS_CA === 'null' ? null : envVars.TLS_CA;

module.exports = {
    mqtt: {
        brokers: {
            area: { url: envVars.MQTT_BROKER_URL, port: envVars.MQTT_BROKER_PORT },
            enterprise: { url: envVars.MQTT_BROKER_URL, port: envVars.MQTT_BROKER_PORT }
        },
        topics: {
            parris: 'spBv1.0/Plant1:Area1:Line1:Cell1/DDATA/device1',
            schultz: 'spBv1.0/+/+/NDATA/+'
        },
        namespace: 'spBv1.0',
        tls: {
            key: tlsKey,
            cert: tlsCert,
            ca: tlsCa
        },
        auth: {
            username: envVars.MQTT_USERNAME,
            password: envVars.MQTT_PASSWORD
        }
    },
    method: envVars.METHOD,
    structure,
    logRetentionDays: envVars.LOG_RETENTION_DAYS,
    oeeAsPercent: envVars.OEE_AS_PERCENT,
    influxdb: {
        url: envVars.INFLUXDB_URL,
        token: envVars.INFLUXDB_TOKEN,
        org: envVars.INFLUXDB_ORG,
        bucket: envVars.INFLUXDB_BUCKET
    },
    topicFormat: envVars.TOPIC_FORMAT // Add the topic format here
};