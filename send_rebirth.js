const mqtt = require('mqtt');

// MQTT Broker URL und Thema
const brokerUrl = 'mqtt://your-mqtt-broker-url';
const groupId = 'YourGroupID';
const edgeNodeId = 'YourEdgeNodeID';

// MQTT Client Setup
const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Rebirth-Befehl senden
    const rebirthTopic = `spBv1.0/${groupId}/NCMD/${edgeNodeId}`;
    const rebirthMessage = {
        metric: 'Node Control/Rebirth',
        value: true
    };

    client.publish(rebirthTopic, JSON.stringify(rebirthMessage), { qos: 0, retain: false }, (err) => {
        if (err) {
            console.error('Failed to send rebirth message:', err);
        } else {
            console.log('Rebirth message sent successfully');
        }
        client.end();
    });
});

client.on('error', (err) => {
    console.error('Failed to connect to MQTT broker:', err);
});