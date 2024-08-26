const axios = require("axios");
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const dotenv = require("dotenv");
const { oeeLogger, errorLogger } = require("../utils/logger");

dotenv.config();

const OEE_API_URL = process.env.OEE_API_URL || "http://localhost:3000/api/v1";

// Caches for data
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
let machineDataCache = null; // Cache for machine.json
let runningOrderCache = {};

async function loadMachineData() {
  if (!machineDataCache) {
    try {
      const response = await axios.get(`${OEE_API_URL}/machines`);
      machineDataCache = response.data;
      oeeLogger.debug(`Machine data loaded from API: ${OEE_API_URL}/machines`);
    } catch (error) {
      oeeLogger.error(`Failed to load machine data from API: ${error.message}`);
      throw error;
    }
  }
  return machineDataCache;
}

async function loadUnplannedDowntimeData() {
  if (!unplannedDowntimeCache) {
    try {
      const response = await axios.get(`${OEE_API_URL}/unplanneddowntime`);
      const data = response.data;

      unplannedDowntimeCache = data.map((downtime) => ({
        ...downtime,
        Start: moment(downtime.Start).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        End: moment(downtime.End).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      }));

      oeeLogger.debug(`Unplanned downtime data loaded from API.`);
    } catch (error) {
      oeeLogger.error(
        `Failed to load unplanned downtime data: ${error.message}`
      );
      throw new Error("Could not load unplanned downtime data");
    }
  }
  return unplannedDowntimeCache;
}

async function loadPlannedDowntimeData() {
  if (!plannedDowntimeCache) {
    try {
      const response = await axios.get(`${OEE_API_URL}/planneddowntime`);
      const data = response.data;

      plannedDowntimeCache = data.map((downtime) => ({
        ...downtime,
        Start: moment(downtime.Start).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        End: moment(downtime.End).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      }));

      oeeLogger.debug(`Planned downtime data loaded from API.`);
    } catch (error) {
      oeeLogger.error(`Failed to load planned downtime data: ${error.message}`);
      throw new Error("Could not load planned downtime data");
    }
  }
  return plannedDowntimeCache;
}

async function loadProcessOrderData() {
  if (!processOrderDataCache) {
    try {
      const response = await axios.get(`${OEE_API_URL}/processorders`);
      let processOrderData = response.data;

      processOrderData = processOrderData.map((order) => ({
        ...order,
        Start: moment(order.Start).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        End: moment(order.End).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      }));

      processOrderDataCache = processOrderData;

      oeeLogger.debug(`Process order data loaded from API.`);
    } catch (error) {
      oeeLogger.error(`Failed to load process order data: ${error.message}`);
      throw new Error("Could not load process order data");
    }
  }
  return processOrderDataCache;
}

async function getMachineIdFromLineCode(lineCode) {
  oeeLogger.info(`Searching for machine ID with line code: ${lineCode}`);

  try {
    const machines = await loadMachineData();
    const machine = machines.find((m) => m.name === lineCode);

    if (machine) {
      oeeLogger.info(
        `Machine ID ${machine.machine_id} found for line code: ${lineCode}`
      );
      return machine.machine_id;
    } else {
      oeeLogger.warn(`No machine ID found for line code: ${lineCode}`);
      return null;
    }
  } catch (error) {
    oeeLogger.error(`Failed to retrieve machine ID: ${error.message}`);
    throw new Error("Could not retrieve machine data");
  }
}

async function checkForRunningOrder(machineId) {
  // Überprüfe, ob der Wert im Cache vorhanden ist
  if (runningOrderCache[machineId]) {
    oeeLogger.debug(
      `Returning cached running order for machine ID: ${machineId}`
    );
    return runningOrderCache[machineId];
  }

  try {
    const response = await axios.get(
      `${OEE_API_URL}/processorders/rel?machineId=${machineId}&mark=true`
    );
    const runningOrder = response.data;

    // Überprüfen, ob ein laufender Auftrag gefunden wurde
    if (runningOrder && runningOrder.length > 0) {
      oeeLogger.info(`Running order found for machine ID: ${machineId}`);
      // Cache den gefundenen Auftrag
      runningOrderCache[machineId] = true;
      return true;
    } else {
      oeeLogger.warn(`No running order found for machine ID: ${machineId}`);
      // Setze den Cache-Wert auf false, wenn kein laufender Auftrag gefunden wurde
      runningOrderCache[machineId] = false;
      return false;
    }
  } catch (error) {
    oeeLogger.error(`Failed to check for running order: ${error.message}`);
    throw new Error("Could not retrieve process order data");
  }
}

module.exports = {
  loadMachineData,
  loadUnplannedDowntimeData,
  loadPlannedDowntimeData,
  loadProcessOrderData,
  getMachineIdFromLineCode,
  checkForRunningOrder,
};
