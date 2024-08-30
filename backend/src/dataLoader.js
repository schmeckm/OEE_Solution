<<<<<<< HEAD
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { oeeLogger, errorLogger } = require("../utils/logger");
const { loadJsonData } = require("./dataService");

// Pfade zu den JSON-Daten-Dateien, die in den OEE-Berechnungen verwendet werden
const unplannedDowntimeFilePath = path.resolve(
  __dirname,
  "../data/unplannedDowntime.json"
);
const plannedDowntimeFilePath = path.resolve(
  __dirname,
  "../data/plannedDowntime.json"
);
const processOrderFilePath = path.resolve(
  __dirname,
  "../data/processOrder.json"
);
const shiftModelFilePath = path.resolve(__dirname, "../data/shiftModel.json");
const microstopFilePath = path.resolve(__dirname, "../data/microstops.json");

// Cache-Variablen zum Speichern geladener Daten und Vermeidung redundanter Dateilesungen
=======
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const dotenv = require("dotenv");
const { oeeLogger, errorLogger } = require("../utils/logger");

dotenv.config();

const OEE_API_URL = process.env.OEE_API_URL || "http://localhost:3000/api/v1";

// Caches for various data
>>>>>>> backup-branch
let unplannedDowntimeCache = null;
let plannedDowntimeCache = null;
let processOrderDataCache = null;
let shiftModelDataCache = null;
<<<<<<< HEAD
let microstopCache = null;

// Funktion zur Invalidierung aller Caches, um ein erneutes Laden der Daten aus Dateien zu erzwingen
function invalidateCache() {
  unplannedDowntimeCache = null;
  plannedDowntimeCache = null;
  processOrderDataCache = null;
  shiftModelDataCache = null;
  microstopCache = null;
}

// Funktion zum Laden und Cachen der Mikrostopps aus der JSON-Datei
function loadMicrostopData() {
  if (!microstopCache) {
    try {
      microstopCache = loadJsonData(microstopFilePath);
      if (!Array.isArray(microstopCache)) {
        oeeLogger.warn(
          `Expected an array in microstop.json but received: ${typeof microstopCache}`
        );
        microstopCache = [];
      } else if (microstopCache.length === 0) {
        oeeLogger.warn(`Microstop array is empty in ${microstopFilePath}`);
      } else {
        oeeLogger.debug(
          `Microstop data successfully loaded: ${JSON.stringify(
            microstopCache,
            null,
            2
          )}`
        );
      }
    } catch (error) {
      errorLogger.error(
        `Error reading or processing microstop.json: ${error.message}`
      );
      throw error;
    }
  }
  return microstopCache;
}

// Funktion zum parallelen Laden aller JSON-Daten-Dateien und Cachen der Daten
async function loadAllData() {
  try {
    const [
      unplannedDowntime,
      plannedDowntime,
      processOrders,
      shifts,
      microstops,
    ] = await Promise.all([
      loadJsonData(unplannedDowntimeFilePath),
      loadJsonData(plannedDowntimeFilePath),
      loadJsonData(processOrderFilePath),
      loadJsonData(shiftModelFilePath),
      loadJsonData(microstopFilePath),
    ]);

    unplannedDowntimeCache = unplannedDowntime;
    plannedDowntimeCache = plannedDowntime;
    processOrderDataCache = processOrders;
    shiftModelDataCache = shifts;
    microstopCache = microstops;

    oeeLogger.info("All data loaded and cached successfully.");
  } catch (error) {
    errorLogger.error(`Error loading data in parallel: ${error.message}`);
    throw error;
  }
}

// Funktion zum Laden der ungeplanten Ausfallzeiten, falls noch nicht im Cache
function loadUnplannedDowntimeData() {
  if (!unplannedDowntimeCache) {
    unplannedDowntimeCache = loadJsonData(unplannedDowntimeFilePath);
  }
  return unplannedDowntimeCache;
}

// Funktion zum Laden der geplanten Ausfallzeiten, falls noch nicht im Cache
function loadPlannedDowntimeData() {
  if (!plannedDowntimeCache) {
    plannedDowntimeCache = loadJsonData(plannedDowntimeFilePath);
  }
  return plannedDowntimeCache;
}

// Funktion zum Laden der Prozessauftragsdaten, falls noch nicht im Cache
function loadProcessOrderData() {
  if (!processOrderDataCache) {
    processOrderDataCache = loadJsonData(processOrderFilePath);
  }
  return processOrderDataCache;
}

// Funktion zum Laden der Schichtmodell-Daten, falls noch nicht im Cache
function loadShiftModelData() {
  if (!shiftModelDataCache) {
    shiftModelDataCache = loadJsonData(shiftModelFilePath);
  }
  return shiftModelDataCache;
}

// Funktion zum Parsen eines Datumsstrings in ein Moment-Objekt in UTC
function parseDate(dateStr) {
  return moment.utc(dateStr);
}

// Funktion zum Filtern von Daten nach Maschinen-ID und Zeitbereich
function filterDataByTimeRange(dataArray, machineId, orderStart, orderEnd) {
  oeeLogger.debug(
    `Filtering data for machine ID: ${machineId} between ${orderStart} and ${orderEnd}`
  );

  return dataArray.filter((entry) => {
    const start = parseDate(entry.Start);
    const end = parseDate(entry.End);
    const isMatchingMachine = entry.machine_id === machineId;
    const isInRange =
      start.isBetween(orderStart, orderEnd, null, "[]") ||
      end.isBetween(orderStart, orderEnd, null, "[]");

    // Detailliertes Logging für jeden Eintrag hinzufügen
    oeeLogger.debug(
      `  Machine Match: ${isMatchingMachine}, In Range: ${isInRange}`
    );

    return isMatchingMachine && isInRange;
  });
}

// Funktion zur Berechnung der Überlappungsdauer zwischen zwei Zeitintervallen
function calculateOverlap(start1, end1, start2, end2) {
  const overlapStart = moment.max(start1, start2);
  const overlapEnd = moment.min(end1, end2);
  return Math.max(0, overlapEnd.diff(overlapStart, "minutes"));
}

// Funktion zum Abrufen der Mikrostopps, gefiltert nach Maschinen-ID und Zeitbereich
function getMicrostops(machineId, processOrderStartTime, processOrderEndTime) {
  return filterDataByTimeRange(
    loadMicrostopData(),
    machineId,
    processOrderStartTime,
    processOrderEndTime
  );
}

// Funktion zum Abrufen der geplanten Ausfallzeiten, gefiltert nach Maschinen-ID und Zeitbereich
function getPlannedDowntime(
  machineId,
  processOrderStartTime,
  processOrderEndTime
) {
  return filterDataByTimeRange(
    loadPlannedDowntimeData(),
    machineId,
    processOrderStartTime,
    processOrderEndTime
  );
}

// Funktion zum Abrufen der ungeplanten Ausfallzeiten, gefiltert nach Maschinen-ID und Zeitbereich
function getUnplannedDowntime(
  machineId,
  processOrderStartTime,
  processOrderEndTime
) {
  return filterDataByTimeRange(
    loadUnplannedDowntimeData(),
    machineId,
    processOrderStartTime,
    processOrderEndTime
  );
}

// Funktion zur Berechnung der Dauer einer Pause, gegeben Start- und Endzeit
function calculateBreakDuration(breakStart, breakEnd) {
  const breakStartTime = moment(breakStart, "HH:mm");
  const breakEndTime = moment(breakEnd, "HH:mm");
  return breakEndTime.diff(breakStartTime, "minutes");
}

// Funktion zum Filtern und Berechnen der Dauern für die OEE-Berechnung
function filterAndCalculateDurations(
  processOrder,
  plannedDowntime,
  unplannedDowntime,
  microstops,
  shifts
) {
  const orderStart = parseDate(processOrder.Start).startOf("hour");
  const orderEnd = parseDate(processOrder.End).endOf("hour");

  oeeLogger.debug(
    `Order Start: ${orderStart.format()}, Order End: ${orderEnd.format()}`
  );

  // Gefilterte geplante Ausfallzeiten
  const filteredPlannedDowntime = plannedDowntime.filter((downtime) => {
    const start = parseDate(downtime.Start);
    const end = parseDate(downtime.End);
    const isInRange =
      start.isBetween(orderStart, orderEnd, null, "[]") ||
      end.isBetween(orderStart, orderEnd, null, "[]");
    oeeLogger.debug(
      `Planned Downtime: Start: ${start.format()}, End: ${end.format()}, In Range: ${isInRange}`
    );
    return isInRange;
  });

  // Gefilterte ungeplante Ausfallzeiten
  const filteredUnplannedDowntime = unplannedDowntime.filter((downtime) => {
    const start = parseDate(downtime.Start);
    const end = parseDate(downtime.End);
    const isInRange =
      start.isBetween(orderStart, orderEnd, null, "[]") ||
      end.isBetween(orderStart, orderEnd, null, "[]");
    oeeLogger.debug(
      `Unplanned Downtime: Start: ${start.format()}, End: ${end.format()}, In Range: ${isInRange}`
    );
    return isInRange;
  });

  // Gefilterte Mikrostopps
  const filteredMicrostops = microstops.filter((microstop) => {
    const start = parseDate(microstop.Start);
    const end = parseDate(microstop.End);
    const isInRange =
      start.isBetween(orderStart, orderEnd, null, "[]") ||
      end.isBetween(orderStart, orderEnd, null, "[]");
    oeeLogger.debug(
      `Microstop: Start: ${start.format()}, End: ${end.format()}, In Range: ${isInRange}`
    );
    return isInRange;
  });

  // Gefilterte Pausen
  const filteredBreaks = shifts.flatMap((shift) => {
    const shiftStart = moment.utc(
      `${moment(orderStart).format("YYYY-MM-DD")} ${shift.shift_start_time}`,
      "YYYY-MM-DD HH:mm"
    );
    const shiftEnd = moment.utc(
      `${moment(orderStart).format("YYYY-MM-DD")} ${shift.shift_end_time}`,
      "YYYY-MM-DD HH:mm"
    );

    // Überprüfen, ob die Schicht innerhalb des Bestellzeitraums liegt
    if (shiftEnd.isBefore(orderStart) || shiftStart.isAfter(orderEnd)) {
      oeeLogger.debug(
        `Shift outside of order range: ${shift.shift_start_time} - ${shift.shift_end_time}`
      );
      return [];
    }

    // Berechnung der tatsächlichen Schichtzeiten innerhalb des Bestellzeitraums
    const actualShiftStart = moment.max(shiftStart, orderStart);
    const actualShiftEnd = moment.min(shiftEnd, orderEnd);

    const breakDuration = calculateBreakDuration(
      shift.break_start_time,
      shift.break_end_time
    );

    return [
      {
        start: actualShiftStart,
        end: actualShiftEnd,
        duration: breakDuration,
      },
    ];
  });

  // Gesamt geplante Ausfallzeit berechnen
  const totalPlannedDowntime = filteredPlannedDowntime.reduce(
    (acc, downtime) => {
      const start = parseDate(downtime.Start);
      const end = parseDate(downtime.End);
      acc += calculateOverlap(start, end, orderStart, orderEnd);
      return acc;
    },
    0
  );

  // Gesamt ungeplante Ausfallzeit berechnen
  const totalUnplannedDowntime = filteredUnplannedDowntime.reduce(
    (acc, downtime) => {
      const start = parseDate(downtime.Start);
      const end = parseDate(downtime.End);
      acc += calculateOverlap(start, end, orderStart, orderEnd);
      return acc;
    },
    0
  );

  // Gesamt Mikrostopps berechnen
  const totalMicrostops = filteredMicrostops.length;
  const totalMicrostopDuration = filteredMicrostops.reduce((acc, microstop) => {
    const start = parseDate(microstop.Start);
    const end = parseDate(microstop.End);
    acc += calculateOverlap(start, end, orderStart, orderEnd);
    return acc;
  }, 0);

  // Gesamt Pausen berechnen
  const totalBreakDuration = filteredBreaks.reduce(
    (acc, brk) => acc + brk.duration,
    0
  );

  oeeLogger.debug(`Total Planned Downtime: ${totalPlannedDowntime} minutes`);
  oeeLogger.debug(
    `Total Unplanned Downtime: ${totalUnplannedDowntime} minutes`
  );
  oeeLogger.debug(
    `Total Microstops: ${totalMicrostops}, Duration: ${totalMicrostopDuration} minutes`
  );
  oeeLogger.debug(`Total Break Duration: ${totalBreakDuration} minutes`);

  return {
    plannedDowntime: totalPlannedDowntime,
    unplannedDowntime: totalUnplannedDowntime,
    microstops: totalMicrostops,
    microstopDuration: totalMicrostopDuration,
    breaks: totalBreakDuration,
  };
}

// Hauptfunktion zur Vorbereitung der OEE-Daten
async function loadDataAndPrepareOEE(machineId) {
  try {
    // Laden aller Daten, falls noch nicht geladen
    await loadAllData();

    const processOrders = loadProcessOrderData().filter(
      (order) => order.machine_id === machineId
    );
    const shifts = loadShiftModelData();

    const oeeData = processOrders.map((order) => {
      const start = parseDate(order.Start);
      const end = parseDate(order.End);
      const plannedDowntime = getPlannedDowntime(machineId, start, end);
      const unplannedDowntime = getUnplannedDowntime(machineId, start, end);
      const microstops = getMicrostops(machineId, start, end);

      return filterAndCalculateDurations(
        order,
        plannedDowntime,
        unplannedDowntime,
        microstops,
        shifts
      );
    });

    oeeLogger.info("OEE data prepared successfully.");
    return oeeData;
  } catch (error) {
    errorLogger.error(`Error preparing OEE data: ${error.message}`);
    throw error;
  }
}

// Exportieren der Funktionen für die Verwendung in anderen Modulen
module.exports = {
  invalidateCache,
  loadMicrostopData,
  loadAllData,
  loadUnplannedDowntimeData,
  loadPlannedDowntimeData,
  loadProcessOrderData,
  loadShiftModelData,
  parseDate,
  filterDataByTimeRange,
  calculateOverlap,
  getMicrostops,
  getPlannedDowntime,
  getUnplannedDowntime,
  calculateBreakDuration,
  filterAndCalculateDurations,
  loadDataAndPrepareOEE,
};
=======
let machineDataCache = null; // Cache for machine data
let runningOrderCache = {}; // Cache for running orders per machine
let processOrderByMachineCache = {}; // Cache for process orders by machine
let microstopsCache = null;
const shiftModelCache = {}; // Cache for shift models per machine

// Load machine data from the API, caching the result
async function loadMachineData() {
    if (!machineDataCache) {
        try {
            const response = await axios.get(`${OEE_API_URL}/machines`);
            machineDataCache = response.data;
            oeeLogger.info(`Machine data loaded successfully.`);
        } catch (error) {
            errorLogger.error(`Failed to load machine data: ${error.message}`);
            throw error;
        }
    }
    return machineDataCache;
}

// Load unplanned downtime data from the API, caching the result
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

            oeeLogger.debug(`Unplanned downtime data loaded successfully.`);
        } catch (error) {
            errorLogger.error(
                `Failed to load unplanned downtime data: ${error.message}`
            );
            throw new Error("Could not load unplanned downtime data");
        }
    }
    return unplannedDowntimeCache;
}

// Load planned downtime data from the API, caching the result
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

            oeeLogger.info(`Planned downtime data loaded successfully.`);
        } catch (error) {
            errorLogger.error(
                `Failed to load planned downtime data: ${error.message}`
            );
            throw new Error("Could not load planned downtime data");
        }
    }
    return plannedDowntimeCache;
}

// Load process order data from the API, caching the result
async function loadProcessOrderData() {
    if (!processOrderDataCache) {
        try {
            const response = await axios.get(`${OEE_API_URL}/processorders`);

            if (!Array.isArray(response.data)) {
                throw new Error("Process order data is not an array");
            }

            let processOrderData = response.data;

            processOrderData = processOrderData.map((order) => ({
                ...order,
                Start: moment(order.Start).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
                End: moment(order.End).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
            }));

            processOrderDataCache = processOrderData;

            oeeLogger.debug(`Process order data loaded successfully.`);
        } catch (error) {
            errorLogger.error(`Failed to load process order data: ${error.message}`);
            throw new Error("Could not load process order data");
        }
    }

    if (!Array.isArray(processOrderDataCache)) {
        throw new Error("processOrderDataCache is not an array after loading");
    }

    return processOrderDataCache;
}

// Load process orders for a specific machine, caching the result
async function loadProcessOrderDataByMachine(machineId) {
    if (processOrderByMachineCache[machineId]) {
        oeeLogger.debug(
            `Returning cached process orders for machine ID: ${machineId}`
        );
        return processOrderByMachineCache[machineId];
    }

    try {
        const response = await axios.get(
            `${OEE_API_URL}/processorders/rel?machineId=${machineId}&mark=true`
        );
        let processOrderData = response.data;

        processOrderData = processOrderData.map((order) => ({
            ...order,
            Start: moment(order.Start).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
            End: moment(order.End).format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        }));

        processOrderByMachineCache[machineId] = processOrderData;
        oeeLogger.info(
            `Process order data loaded successfully for machine ID: ${machineId}`
        );
        return processOrderData;
    } catch (error) {
        errorLogger.error(
            `Failed to load process order data for machine ID ${machineId}: ${error.message}`
        );
        throw new Error("Could not load process order data by machine");
    }
}

// Retrieve the machine ID using a line code, using cached data if available
async function getMachineIdFromLineCode(lineCode) {
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
        errorLogger.error(`Failed to retrieve machine ID: ${error.message}`);
        throw new Error("Could not retrieve machine data");
    }
}

// Check for a running order for a specific machine, caching the result
async function checkForRunningOrder(machineId) {
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

        if (runningOrder && runningOrder.length > 0) {
            oeeLogger.info(`Running order found for machine ID: ${machineId}`);
            runningOrderCache[machineId] = runningOrder[0];
            return runningOrder[0];
        } else {
            oeeLogger.warn(`No running order found for machine ID: ${machineId}`);
            runningOrderCache[machineId] = null;
            return null;
        }
    } catch (error) {
        errorLogger.error(`Failed to check for running order: ${error.message}`);
        throw new Error("Could not retrieve process order data");
    }
}

// Load microstops data from the API, caching the result
async function loadMicrostops() {
    if (microstopsCache) {
        oeeLogger.debug("Returning cached microstops data");
        return microstopsCache;
    }

    try {
        const response = await axios.get(`${OEE_API_URL}/microstops`);

        if (Array.isArray(response.data)) {
            microstopsCache = response.data;
            oeeLogger.info("Microstops data loaded successfully.");
            return microstopsCache;
        } else {
            oeeLogger.warn("Unexpected format of microstops data");
            throw new Error("Invalid microstops data format");
        }
    } catch (error) {
        errorLogger.error(`Failed to load microstops data: ${error.message}`);
        throw new Error("Could not load microstops data");
    }
}

// Load shift model data for a specific machine from the API, caching the result
async function loadShiftModelData(machineId) {
    if (shiftModelCache[machineId]) {
        oeeLogger.debug(
            `Returning cached shift model data for machine ID: ${machineId}`
        );
        return shiftModelCache[machineId];
    }

    try {
        const response = await axios.get(
            `${OEE_API_URL}/shiftmodels/machine/${machineId}`
        );
        if (Array.isArray(response.data)) {
            shiftModelCache[machineId] = response.data;
            oeeLogger.info(
                `Shift model data loaded successfully for machine ID: ${machineId}`
            );
            return shiftModelCache[machineId];
        } else {
            oeeLogger.warn(
                `Unexpected format of shift model data for machine ID: ${machineId}`
            );
            throw new Error("Invalid shift model data format");
        }
    } catch (error) {
        errorLogger.error(
            `Failed to load shift model data for machine ID: ${machineId}: ${error.message}`
        );
        throw new Error("Could not load shift model data");
    }
}

// Filters and calculates durations for OEE calculation
function filterAndCalculateDurations(
    processOrder,
    plannedDowntime,
    unplannedDowntime,
    microstops,
    shifts
) {
    const orderStart = parseDate(processOrder.Start).startOf("hour");
    const orderEnd = parseDate(processOrder.End).endOf("hour");

    oeeLogger.debug(
        `Processing order from ${orderStart.format()} to ${orderEnd.format()}`
    );

    // Filter planned downtime entries
    const filteredPlannedDowntime = plannedDowntime.filter((downtime) => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        const isInRange =
            start.isBetween(orderStart, orderEnd, null, "[]") ||
            end.isBetween(orderStart, orderEnd, null, "[]");
        return isInRange;
    });

    // Filter unplanned downtime entries
    const filteredUnplannedDowntime = unplannedDowntime.filter((downtime) => {
        const start = parseDate(downtime.Start);
        const end = parseDate(downtime.End);
        const isInRange =
            start.isBetween(orderStart, orderEnd, null, "[]") ||
            end.isBetween(orderStart, orderEnd, null, "[]");
        return isInRange;
    });

    // Filter microstops
    const filteredMicrostops = microstops.filter((microstop) => {
        const start = parseDate(microstop.Start);
        const end = parseDate(microstop.End);
        const isInRange =
            start.isBetween(orderStart, orderEnd, null, "[]") ||
            end.isBetween(orderStart, orderEnd, null, "[]");
        return isInRange;
    });

    // Filter breaks based on shifts
    const filteredBreaks = shifts.flatMap((shift) => {
        const shiftStart = moment.utc(
            `${moment(orderStart).format("YYYY-MM-DD")} ${shift.shift_start_time}`,
            "YYYY-MM-DD HH:mm"
        );
        const shiftEnd = moment.utc(
            `${moment(orderStart).format("YYYY-MM-DD")} ${shift.shift_end_time}`,
            "YYYY-MM-DD HH:mm"
        );
        const breakStart = moment.utc(
            `${moment(orderStart).format("YYYY-MM-DD")} ${shift.break_start}`,
            "YYYY-MM-DD HH:mm"
        );
        const breakEnd = moment.utc(
            `${moment(orderStart).format("YYYY-MM-DD")} ${shift.break_end}`,
            "YYYY-MM-DD HH:mm"
        );

        if (breakEnd.isBefore(breakStart)) {
            breakEnd.add(1, "day");
        }
        if (shiftEnd.isBefore(shiftStart)) {
            shiftEnd.add(1, "day");
        }

        if (shift.machine_id === processOrder.machine_id) {
            return [{
                breakDuration: calculateBreakDuration(
                    shift.break_start,
                    shift.break_end
                ),
                breakStart: breakStart.format(),
                breakEnd: breakEnd.format(),
            }, ];
        }
        return [];
    });

    return {
        plannedDowntime: filteredPlannedDowntime,
        unplannedDowntime: filteredUnplannedDowntime,
        microstops: filteredMicrostops,
        breaks: filteredBreaks,
    };
}

// Helper function to parse date strings into Moment objects in UTC
function parseDate(dateStr) {
    return moment.utc(dateStr);
}

// Helper function to calculate the duration of a break
function calculateBreakDuration(breakStart, breakEnd) {
    const breakStartTime = moment(breakStart, "HH:mm");
    const breakEndTime = moment(breakEnd, "HH:mm");
    return breakEndTime.diff(breakStartTime, "minutes");
}

// Export all functions to be used in other modules
module.exports = {
    loadMachineData,
    loadUnplannedDowntimeData,
    loadMicrostops,
    loadPlannedDowntimeData,
    loadProcessOrderData,
    loadProcessOrderDataByMachine,
    getMachineIdFromLineCode,
    checkForRunningOrder,
    loadShiftModelData,
    filterAndCalculateDurations,
};
>>>>>>> backup-branch
