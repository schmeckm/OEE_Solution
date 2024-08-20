const express = require('express');

// OEE Routes
const machinesRouter = require('./machines');
const plannedDowntimeRouter = require('./plannedDowntime');
const processOrdersRouter = require('./processOrders');
const shiftModelRouter = require('./shiftModels');
const unplannedDowntimeRouter = require('./unplannedDowntime');
const oeeConfigRouter = require('./oeeConfig');
const microStopsRouter = require('./microstops');
const userRouter = require('./users');
const topicsRouter = require('./topics');

// Additional Routes
// const settingsRouter = require('./settings');
const structureRouter = require('./structure');
const oeeLogsRouter = require('./oeeLogs');
const calculateOEERouter = require('./calculateOEE');

/**
 * Registers the API routes with the provided Express application.
 * 
 * This function sets up all the API endpoints related to OEE (Overall Equipment Effectiveness) 
 * and additional endpoints. It attaches the routers that handle specific API paths to the 
 * Express application instance.
 * 
 * @param {express.Express} app - The Express application instance.
 */
function registerApiRoutes(app) {
    // OEE API Endpoints
    app.use('/api/v1/machines', machinesRouter); // Endpoint to manage machine data
    app.use('/api/v1/planneddowntime', plannedDowntimeRouter); // Endpoint to manage planned downtime data
    app.use('/api/v1/processorders', processOrdersRouter); // Endpoint to manage process orders
    app.use('/api/v1/shiftmodels', shiftModelRouter); // Endpoint to manage shift models
    app.use('/api/v1/unplanneddowntime', unplannedDowntimeRouter); // Endpoint to manage unplanned downtime data
    app.use('/api/v1/oeeconfig', oeeConfigRouter); // Endpoint to manage OEE configuration settings
    app.use('/api/v1/microstops', microStopsRouter); // Endpoint to manage microstops data
    app.use('/api/v1/users', userRouter); // Endpoint to manage microstops data
    app.use('/api/v1', topicsRouter);

    // Additional API Endpoints
    // app.use('/api/v1/settings', settingsRouter); // (Currently commented out) Endpoint to manage settings
    app.use('/api/v1/structure', structureRouter); // Endpoint to manage structure configuration
    app.use('/api/v1/oee-logs', oeeLogsRouter); // Endpoint to manage OEE logs
    app.use('/api/v1/calculateOEE', calculateOEERouter); // Endpoint to calculate OEE based on provided data
    app.use('/api/v1/calculateOEE', calculateOEERouter); // Endpoint to calculate OEE based on provided data

}

module.exports = registerApiRoutes;