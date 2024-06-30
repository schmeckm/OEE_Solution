const Joi = require('joi'); // Import the Joi validation library

const structure = require('./structure.json'); // Import the structure configuration

// Define the schema for environment variables validation using Joi
const envSchema = Joi.object({
    MQTT_BROKER_URL: Joi.string().uri().required(), // The MQTT broker URL must be a valid URI and is required
    MQTT_BROKER_PORT: Joi.number().integer().default(1883), // The MQTT broker port must be an integer, default is 1883
    MQTT_USERNAME: Joi.string().required(), // The MQTT username is required
    MQTT_PASSWORD: Joi.string().required(), // The MQTT password is required
    TLS_KEY: Joi.string().allow(null), // TLS key can be a string or null
    TLS_CERT: Joi.string().allow(null), // TLS certificate can be a string or null
    TLS_CA: Joi.string().allow(null), // TLS certificate authority can be a string or null
    METHOD: Joi.string().default('parris'), // Default method is 'parris'
    PORT: Joi.number().integer().default(3000), // The port must be an integer, default is 3000
    LOG_RETENTION_DAYS: Joi.number().integer().default(2), // Log retention days must be an integer, default is 2
    OEE_AS_PERCENT: Joi.boolean().default(true), // OEE as percentage is a boolean, default is true
    INFLUXDB_URL: Joi.string().allow(null), // InfluxDB URL can be a string or null
    INFLUXDB_TOKEN: Joi.string().allow(null), // InfluxDB token can be a string or null
    INFLUXDB_ORG: Joi.string().allow(null), // InfluxDB organization can be a string or null
    INFLUXDB_BUCKET: Joi.string().allow(null), // InfluxDB bucket can be a string or null
    TOPIC_FORMAT: Joi.string().default('spBv1.0/group_id/message_type/edge_node_id') // Default topic format
}).unknown().required(); // Allow unknown keys and require the schema

// Validate the environment variables against the schema
const { error, value: envVars } = envSchema.validate(process.env);
if (error) {
    throw new Error(`Config validation error: ${error.message}`); // Throw an error if validation fails
}

// Handle null values for TLS keys and certificates
const tlsKey = envVars.TLS_KEY === 'null' ? null : envVars.TLS_KEY;
const tlsCert = envVars.TLS_CERT === 'null' ? null : envVars.TLS_CERT;
const tlsCa = envVars.TLS_CA === 'null' ? null : envVars.TLS_CA;

// Export the validated and processed configuration
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
    structure, // Include the imported structure configuration
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