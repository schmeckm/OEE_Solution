const structure = require('./structure.json');

module.exports = {
    mqtt: {
        brokers: {
            area: { url: process.env.MQTT_BROKER_URL, port: process.env.MQTT_BROKER_PORT || 1883 },
            enterprise: { url: process.env.MQTT_BROKER_URL, port: process.env.MQTT_BROKER_PORT || 1883 }
        },
        topics: {
            parris: 'spBv1.0/Plant1:Area1:Line1:Cell1/DDATA/device1',
            schultz: 'spBv1.0/+/+/NDATA/+'
        },
        namespace: 'spBv1.0',
        tls: {
            key: process.env.TLS_KEY || null,
            cert: process.env.TLS_CERT || null,
            ca: process.env.TLS_CA || null
        },
        auth: {
            username: process.env.MQTT_USERNAME || null,
            password: process.env.MQTT_PASSWORD || null
        }
    },
    method: process.env.METHOD || 'parris',
    structure: structure
};