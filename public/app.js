document.addEventListener("DOMContentLoaded", async() => {
    let ws;
    let reconnectInterval = 5000; // Zeit in Millisekunden, nach der eine erneute Verbindung versucht wird

    const connectWebSocket = () => {
        ws = new WebSocket(`ws://${window.location.host}`);

        ws.onopen = () => {
            console.log("WebSocket connection opened");
            document.getElementById("status").innerText = "Connected";
        };

        ws.onmessage = (event) => {
            try {
                const { type, data } = JSON.parse(event.data);
                console.log("Data received from WebSocket:", { type, data }); // Debugging-Log

                if (type === 'chartData') {
                    console.log("Received chart data:", data); // Debugging-Log
                    updateTimelineChart(timelineChart, data);
                } else if (type === 'oeeData') {
                    console.log("Received process data:", data); // Debugging-Log
                    updateProcessData(data.processData);
                    updateGauge(oeeGauge, data.oee, 'oeeValue');
                    updateGauge(availabilityGauge, data.availability, 'availabilityValue');
                    updateGauge(performanceGauge, data.performance, 'performanceValue');
                    updateGauge(qualityGauge, data.quality, 'qualityValue');
                } else if (type === 'machineData') {
                    console.log("Received machine data:", data); // Debugging-Log
                    updateInterruptionTable(data);
                } else {
                    console.error("Invalid data received from WebSocket:", { type, data });
                }
            } catch (error) {
                console.error("Error processing WebSocket message:", error);
            }
        };

        ws.onclose = () => {
            console.log("WebSocket connection closed. Attempting to reconnect...");
            document.getElementById("status").innerText = "Disconnected";
            setTimeout(connectWebSocket, reconnectInterval); // Versuch, die Verbindung nach einem Intervall wiederherzustellen
        };

        ws.onerror = (error) => {
            console.error(`WebSocket error: ${error.message}`);
            document.getElementById("status").innerText = "Error";
        };
    };

    connectWebSocket();

    const oeeGauge = initGauge('oeeGauge', 'OEE');
    const availabilityGauge = initGauge('availabilityGauge', 'Availability');
    const performanceGauge = initGauge('performanceGauge', 'Performance');
    const qualityGauge = initGauge('qualityGauge', 'Quality');
    const timelineChart = initTimelineChart('timelineChart');

    document.getElementById("timeZone").addEventListener("change", (event) => {
        updateTimeZone(event.target.value);
        updateCurrentTime();
        // Manually trigger the update of process data to apply the new timezone
        const processData = getCurrentProcessData(); // Ensure this function gets the current process data
        if (processData) {
            updateProcessData(processData);
        }
        // Manually trigger the update of machine data to apply the new timezone
        const machineData = getCurrentMachineData(); // Ensure this function gets the current machine data
        if (machineData) {
            updateInterruptionTable(machineData);
        }
    });

    updateCurrentTime();
    setInterval(updateCurrentTime, 1000); // Update the current time every second

    const accordion = document.querySelector('.accordion');
    const panel = document.querySelector('.panel');

    accordion.addEventListener('click', function() {
        this.classList.toggle('active');
        if (panel.style.display === 'block') {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'block';
        }
    });
});

let currentProcessData = null; // Store the current process data
let currentMachineData = null; // Store the current machine data

function updateProcessData(processData) {
    currentProcessData = processData; // Store the data for future reference
    const timeZone = document.getElementById("timeZone").value;

    document.getElementById("orderNumber").innerText = processData.ProcessOrderNumber;
    document.getElementById("startTime").innerText = moment.tz(processData.StartTime, "UTC").tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
    document.getElementById("endTime").innerText = moment.tz(processData.EndTime, "UTC").tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
    document.getElementById("plannedQuantity").innerText = processData.plannedProduction;
    document.getElementById("plannedDowntime").innerText = processData.plannedDowntime;
    document.getElementById("unplannedDowntime").innerText = processData.unplannedDowntime;
    document.getElementById("lineCode").innerText = processData.lineCode || 'N/A';
}

function getCurrentProcessData() {
    return currentProcessData;
}

function getCurrentMachineData() {
    return currentMachineData;
}

function initGauge(elementId, label) {
    const opts = {
        angle: 0.15,
        lineWidth: 0.2,
        radiusScale: 0.7,
        pointer: {
            length: 0.6,
            strokeWidth: 0.035,
            color: '#000000'
        },
        staticLabels: {
            font: "10px sans-serif",
            labels: [0, 50, 70, 100],
            color: "#ffffff",
            fractionDigits: 0
        },
        staticZones: [
            { strokeStyle: "#F03E3E", min: 0, max: 50 },
            { strokeStyle: "#FFDD00", min: 50, max: 70 },
            { strokeStyle: "#30B32D", min: 70, max: 100 }
        ],
        limitMax: false,
        limitMin: false,
        highDpiSupport: true
    };

    const target = document.getElementById(elementId);
    const gauge = new Gauge(target).setOptions(opts);
    gauge.maxValue = 100;
    gauge.setMinValue(0);
    gauge.animationSpeed = 32;

    return gauge;
}

function updateGauge(gauge, value, valueElementId) {
    gauge.set(value);
    const valueElement = document.getElementById(valueElementId);
    if (valueElement) {
        valueElement.innerText = value + '%';
    } else {
        console.error(`Element mit ID ${valueElementId} nicht gefunden`);
    }
}

function initTimelineChart(elementId) {
    return new Chart(document.getElementById(elementId), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                { label: 'Production', data: [], backgroundColor: 'green' },
                { label: 'Break', data: [], backgroundColor: 'blue' },
                { label: 'Unplanned Downtime', data: [], backgroundColor: 'red' },
                { label: 'Planned Downtime', data: [], backgroundColor: 'orange' }
            ]
        },
        options: {
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Duration (minutes)'
                    }
                }
            }
        }
    });
}

function updateTimelineChart(chart, data) {
    currentChartData = data; // Store the data for future reference
    const timeZone = document.getElementById("timeZone").value;

    if (data.labels && data.datasets) {
        chart.data.labels = data.labels.map(label => {
            const utcTime = moment.utc(label);
            const localTime = utcTime.clone().tz(timeZone);
            return localTime.format("HH:mm") + " - " + localTime.clone().add(1, 'hour').format("HH:mm");
        });
        chart.data.datasets[0].data = data.datasets[0].data.map(Math.round); // Round to nearest minute
        chart.data.datasets[1].data = data.datasets[1].data.map(Math.round); // Round to nearest minute
        chart.data.datasets[2].data = data.datasets[2].data.map(Math.round); // Round to nearest minute
        chart.data.datasets[3].data = data.datasets[3].data.map(Math.round); // Round to nearest minute
        chart.update();
    } else {
        console.error("Invalid data format for timeline chart:", data);
    }
}


function updateTimeZone(timeZone) {
    const startTimeElement = document.getElementById("startTime");
    const endTimeElement = document.getElementById("endTime");

    const startTime = startTimeElement.innerText;
    const endTime = endTimeElement.innerText;

    startTimeElement.innerText = moment.tz(startTime, "UTC").tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
    endTimeElement.innerText = moment.tz(endTime, "UTC").tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
}

function updateCurrentTime() {
    const timeZone = document.getElementById("timeZone").value;
    const currentTimeElement = document.getElementById("currentTime");
    currentTimeElement.innerText = moment().tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
}

function updateInterruptionTable(data) {
    currentMachineData = data; // Store the data for future reference
    const tableBody = document.querySelector("#interruptionTable tbody");
    tableBody.innerHTML = ""; // Clear existing table data

    data.forEach(entry => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${entry.ProcessOrderID}</td>
            <td>${entry.ProcessOrderNumber}</td>
            <td>${moment.tz(entry.Start, "UTC").tz(document.getElementById("timeZone").value).format("YYYY-MM-DD HH:mm:ss")}</td>
            <td>${moment.tz(entry.End, "UTC").tz(document.getElementById("timeZone").value).format("YYYY-MM-DD HH:mm:ss")}</td>
            <td>${entry.Differenz}</td>
            <td>${entry.Reason || 'N/A'}</td>
            <td>${entry.ManuellKorrektur || 'N/A'}</td>
        `;
        tableBody.appendChild(row);
    });
}