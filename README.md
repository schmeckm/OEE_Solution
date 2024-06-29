# OEE Calculator for Event Driven IT-OT Architecture Concept to calculate OEE in Realtime based on MQTT topics

A Node.js application to calculate Overall Equipment Effectiveness (OEE) with support for secure MQTT messaging (TLS and authentication).

## Features

- Calculates OEE based on incoming MQTT messages
- Supports secure MQTT connections with TLS
- Optional username/password authentication for MQTT
- Logs information to both console and file

## Requirements

- Node.js
- Docker (optional, for containerized deployment)
- MQTT broker supporting TLS and authentication

## Setup

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/oee-calculator.git
    cd oee-calculator
    ```

2. Install dependencies:
    ```sh
    yarn install
    ```

3. Create a `.env` file with your configuration:
    ```plaintext
    PORT=3000
    MQTT_BROKER_URL=mqtt://your-mqtt-broker-url
    MQTT_BROKER_PORT=1883
    MQTT_USERNAME=your-username
    MQTT_PASSWORD=your-password
    TLS_KEY=./certs/client.key
    TLS_CERT=./certs/client.crt
    TLS_CA=./certs/ca.crt
    METHOD=parris
    ```

4. Place your TLS certificates in the `certs` directory.

## Running the Application

### Locally

```sh
yarn start
