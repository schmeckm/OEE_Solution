const fs = require("fs");
const path = require("path");

const MACHINE_FILE = path.join(__dirname, "../data/machine.json");

// Cache-Variable
let machineCache = null;
let lastModifiedTime = 0;

// Hilfsfunktion zum Laden der Maschinen mit Caching
const loadMachines = () => {
  if (fs.existsSync(MACHINE_FILE)) {
    // Überprüfen, ob die Datei seit dem letzten Laden geändert wurde
    const stats = fs.statSync(MACHINE_FILE);
    const modifiedTime = stats.mtimeMs;

    // Wenn die Datei seit dem letzten Laden nicht geändert wurde, verwenden Sie den Cache
    if (machineCache && lastModifiedTime === modifiedTime) {
      return machineCache;
    }

    // Andernfalls laden Sie die Datei und aktualisieren den Cache
    const data = fs.readFileSync(MACHINE_FILE, "utf8");
    machineCache = JSON.parse(data);
    lastModifiedTime = modifiedTime;

    return machineCache;
  } else {
    return [];
  }
};

// Hilfsfunktion zum Speichern der Maschinen und Aktualisieren des Caches
const saveMachines = (machines) => {
  fs.writeFileSync(MACHINE_FILE, JSON.stringify(machines, null, 4));

  // Cache und letzten Änderungszeitpunkt aktualisieren
  machineCache = machines;
  lastModifiedTime = fs.statSync(MACHINE_FILE).mtimeMs;
};

module.exports = {
  loadMachines,
  saveMachines,
};
