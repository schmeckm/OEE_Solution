const express = require("express");

// OEE Routes
const machinesRouter = require("./machines");
const plannedDowntimeRouter = require("./plannedDowntime");
const processOrdersRouter = require("./processOrders");
const shiftModelRouter = require("./shiftModels");
const unplannedDowntimeRouter = require("./unplannedDowntime");
const oeeConfigRouter = require("./oeeConfig");
const microStopsRouter = require("./microstops");

const userRouter = require("./users");
const topicsRouter = require("./topics");
const ratingsRouter = require("./ratings");
const microstopMachineAggregationRouter = require("./microstopByMachine");
const microstopProcessOrderAggregationRouter = require("./microstopByProcessOrder");
const settingRouter = require("./settings");

// Additional Routes
const structureRouter = require("./structure");
const oeeLogsRouter = require("./oeeLogs");
const calculateOEERouter = require("./calculateOEE");
const oeeMetricsRouter = require("./oeeMetricsRoutes");
const prepareOEERouter = require("./prepareOEE");
const oeeDataRouter = require("./oeeRoutes"); // New OEE data route
const tactRouter = require('./tact');

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
    app.use("/api/v1/machines", machinesRouter);
    app.use("/api/v1/planneddowntime", plannedDowntimeRouter);
    app.use("/api/v1/processorders", processOrdersRouter);
    app.use("/api/v1/shiftmodels", shiftModelRouter);
    app.use("/api/v1/unplanneddowntime", unplannedDowntimeRouter);
    app.use("/api/v1/oeeconfig", oeeConfigRouter);
    app.use("/api/v1/microstops", microStopsRouter);

    // Register microstop aggregation routes
    app.use(
        "/api/v1/microstop-aggregation/machine",
        microstopMachineAggregationRouter
    );
    app.use(
        "/api/v1/microstop-aggregation/process-order",
        microstopProcessOrderAggregationRouter
    ); // Aggregation by process order

    // Additional API Endpoints
    app.use("/api/v1/structure", structureRouter);
    app.use("/api/v1/oee-logs", oeeLogsRouter);
    app.use("/api/v1/calculateOEE", calculateOEERouter);
    app.use("/api/v1/topics", topicsRouter);
    app.use("/api/v1/users", userRouter);
    app.use("/api/v1/ratings", ratingsRouter);
    app.use("/api/v1", oeeMetricsRouter);
    app.use("/api/v1/settings", settingRouter);
    app.use("/api/v1/prepareOEE", prepareOEERouter);
    app.use("/api/v1", oeeDataRouter);
    app.use('/api/v1/tact', tactRouter);
}

module.exports = registerApiRoutes;