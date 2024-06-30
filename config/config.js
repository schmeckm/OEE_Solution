const Joi = require('joi');
const dotenv = require('dotenv');
const structure = require('./structure.json');

// Laden Sie Umgebungsvariablen aus der .env-Datei
dotenv.config();

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
    LOG_RETENTION_DAYS: Joi.number().integer().default(2)
}).unknown().required();

const { error, value: envVars } = envSchema.validate(process.env);
if (error) {
    throw new Error(`Config validation error: ${error.message}`);
}

// Debugging-Ausgabe für Umgebungsvariablen
console.log("Environment Variables:", process.env);

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
    logRetentionDays: envVars.LOG_RETENTION_DAYS
};