const {
  checkForRunningOrder,
  loadPlannedDowntimeData,
  loadUnplannedDowntimeData,
  loadMicrostops,
  loadShiftModelData,
  filterAndCalculateDurations,
} = require("../src/dataLoader");
const { oeeLogger, errorLogger } = require("../utils/logger");
const moment = require("moment");

function parseDate(dateString) {
  return moment(dateString);
}

function calculateOverlap(startTime, endTime, eventStart, eventEnd) {
  const overlapStart = moment.max(startTime, eventStart);
  const overlapEnd = moment.min(endTime, eventEnd);
  return Math.max(0, overlapEnd.diff(overlapStart, "minutes"));
}

async function loadDataAndPrepareOEE(machineId) {
  if (!machineId) {
    throw new Error("MachineId is required to load and prepare OEE data.");
  }

  try {
    const currentProcessOrder = await checkForRunningOrder(machineId);

    if (!currentProcessOrder) {
      throw new Error(
        `No running process orders found for machineId: ${machineId}`
      );
    }

    const processOrderStartTime = moment(currentProcessOrder.Start);
    const processOrderEndTime = moment(currentProcessOrder.End);

    oeeLogger.info(
      `Current process order details: ${JSON.stringify(
        currentProcessOrder,
        null,
        2
      )}`
    );

    const [
      plannedDowntimeData,
      unplannedDowntimeData,
      microstopsData,
      shiftModels,
    ] = await Promise.all([
      loadPlannedDowntimeData(),
      loadUnplannedDowntimeData(),
      loadMicrostops(),
      loadShiftModelData(machineId),
    ]);

    const filterDowntimeData = (downtimeData) => {
      return downtimeData.filter(
        (downtime) =>
          downtime.machine_id === machineId &&
          moment(downtime.End).isAfter(processOrderStartTime) &&
          moment(downtime.Start).isBefore(processOrderEndTime)
      );
    };

    const filteredPlannedDowntime = filterDowntimeData(plannedDowntimeData);
    const filteredUnplannedDowntime = filterDowntimeData(unplannedDowntimeData);
    const filteredMicrostops = filterDowntimeData(microstopsData);

    oeeLogger.debug(
      `Filtered planned downtime data: ${JSON.stringify(
        filteredPlannedDowntime
      )}`
    );
    oeeLogger.debug(
      `Filtered unplanned downtime data: ${JSON.stringify(
        filteredUnplannedDowntime
      )}`
    );
    oeeLogger.debug(
      `Filtered microstops data: ${JSON.stringify(filteredMicrostops)}`
    );

    const durations = filterAndCalculateDurations(
      currentProcessOrder,
      filteredPlannedDowntime,
      filteredUnplannedDowntime,
      filteredMicrostops,
      shiftModels
    );

    const OEEData = {
      labels: [],
      datasets: [
        { label: "Production", data: [], backgroundColor: "green" },
        { label: "Break", data: [], backgroundColor: "blue" },
        { label: "Unplanned Downtime", data: [], backgroundColor: "red" },
        { label: "Planned Downtime", data: [], backgroundColor: "orange" },
        { label: "Microstops", data: [], backgroundColor: "purple" },
      ],
    };

    let currentTime = processOrderStartTime.clone().startOf("hour");
    const orderEnd = processOrderEndTime.clone().endOf("hour");

    while (currentTime.isBefore(orderEnd)) {
      const nextTime = currentTime.clone().add(1, "hour");

      if (OEEData.labels.includes(currentTime.toISOString())) {
        oeeLogger.warn(
          `Duplicate interval detected: ${currentTime.toISOString()} - Skipping this interval.`
        );
        currentTime = nextTime;
        continue;
      }

      OEEData.labels.push(currentTime.toISOString());

      let productionTime = nextTime.diff(currentTime, "minutes");
      let breakTime = 0;
      let unplannedDowntime = 0;
      let plannedDowntime = 0;
      let microstopTime = 0;

      // Calculate overlap for planned downtime
      filteredPlannedDowntime.forEach((downtime) => {
        const downtimeStart = moment(downtime.Start);
        const downtimeEnd = moment(downtime.End);

        if (
          currentTime.isBefore(downtimeEnd) &&
          nextTime.isAfter(downtimeStart)
        ) {
          plannedDowntime += calculateOverlap(
            currentTime,
            nextTime,
            downtimeStart,
            downtimeEnd
          );
        }
      });

      // Calculate overlap for unplanned downtime
      filteredUnplannedDowntime.forEach((downtime) => {
        const downtimeStart = moment(downtime.Start);
        const downtimeEnd = moment(downtime.End);

        if (
          currentTime.isBefore(downtimeEnd) &&
          nextTime.isAfter(downtimeStart)
        ) {
          unplannedDowntime += calculateOverlap(
            currentTime,
            nextTime,
            downtimeStart,
            downtimeEnd
          );
        }
      });

      // Calculate overlap for microstops
      filteredMicrostops.forEach((microstop) => {
        const microstopStart = moment(microstop.Start);
        const microstopEnd = moment(microstop.End);

        if (
          currentTime.isBefore(microstopEnd) &&
          nextTime.isAfter(microstopStart)
        ) {
          microstopTime += calculateOverlap(
            currentTime,
            nextTime,
            microstopStart,
            microstopEnd
          );
        }
      });

      // Calculate breaks based on shifts
      shiftModels.forEach((shift) => {
        const shiftStartDate = moment(currentTime).format("YYYY-MM-DD");
        const breakStart = moment.utc(
          `${shiftStartDate} ${shift.break_start}`,
          "YYYY-MM-DD HH:mm"
        );
        const breakEnd = moment.utc(
          `${shiftStartDate} ${shift.break_end}`,
          "YYYY-MM-DD HH:mm"
        );

        // Adjust for overnight shifts
        if (breakEnd.isBefore(breakStart)) {
          breakEnd.add(1, "day");
        }

        if (currentTime.isBefore(breakEnd) && nextTime.isAfter(breakStart)) {
          breakTime += calculateOverlap(
            currentTime,
            nextTime,
            breakStart,
            breakEnd
          );
        }
      });

      const totalNonProductionTime =
        breakTime + unplannedDowntime + plannedDowntime + microstopTime;
      productionTime = Math.max(0, productionTime - totalNonProductionTime);

      oeeLogger.debug(
        `Interval ${currentTime.format("HH:mm")} - ${nextTime.format("HH:mm")}:`
      );
      oeeLogger.debug(`  Production time: ${productionTime} minutes`);
      oeeLogger.debug(`  Break time: ${breakTime} minutes`);
      oeeLogger.debug(`  Unplanned downtime: ${unplannedDowntime} minutes`);
      oeeLogger.debug(`  Planned downtime: ${plannedDowntime} minutes`);
      oeeLogger.debug(`  Microstop time: ${microstopTime} minutes`);

      OEEData.datasets[0].data.push(productionTime);
      OEEData.datasets[1].data.push(breakTime);
      OEEData.datasets[2].data.push(unplannedDowntime);
      OEEData.datasets[3].data.push(plannedDowntime);
      OEEData.datasets[4].data.push(microstopTime);

      currentTime = nextTime;
    }

    oeeLogger.info(`Final OEE Data: ${JSON.stringify(OEEData)}`);
    return OEEData;
  } catch (error) {
    errorLogger.error(`Error loading or preparing OEE data: ${error.message}`);
    throw error;
  }
}

module.exports = {
  loadDataAndPrepareOEE,
};
