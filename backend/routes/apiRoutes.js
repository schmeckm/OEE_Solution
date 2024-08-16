const express = require('express');

// OEE Routes
const machinesRouter = require('./machines');
const plannedDowntimeRouter = require('./plannedDowntime');
const processOrdersRouter = require('./processOrders');
const shiftModelRouter = require('./shiftModels');
const unplannedDowntimeRouter = require('./unplannedDowntime');
const oeeConfigRouter = require('./oeeConfig');
const microStopsRouter = require('./microstops');

// Additional Routes
//const settingsRouter = require('./settings');
const structureRouter = require('./structure');
const oeeLogsRouter = require('./oeeLogs');
const calculateOEERouter = require('./calculateOEE');

/**
 * Funktion zur Registrierung der API-Routen.
 * @param {Object} app - Express-Anwendung.
 */
function registerApiRoutes(app) {
    // OEE API Endpoints
    app.use('/api/v1/machines', machinesRouter);
    app.use('/api/v1/planneddowntime', plannedDowntimeRouter);
    app.use('/api/v1/processorders', processOrdersRouter);
    app.use('/api/v1/shiftmodels', shiftModelRouter);
    app.use('/api/v1/unplanneddowntime', unplannedDowntimeRouter);
    app.use('/api/v1/oeeconfig', oeeConfigRouter);
    app.use('/api/v1/microstops', microStopsRouter);

    // Additional API Endpoints
    // app.use('/api/v1/settings', settingsRouter)
    app.use('/api/v1/structure', structureRouter);
    app.use('/api/v1/oee-logs', oeeLogsRouter);
    app.use('/api/v1/calculateOEE', calculateOEERouter);
}

module.exports = registerApiRoutes;