let ws; // Declare ws in a global scope
let reconnectInterval = 5000; // Time in milliseconds to attempt reconnection
let messageQueue = []; // Queue to hold messages until the WebSocket is open

document.addEventListener("DOMContentLoaded", async() => {
    const connectWebSocket = () => {
        ws = new WebSocket(`ws://${window.location.host}`);

        ws.onopen = () => {
            console.log("WebSocket connection opened");
            document.getElementById("status").innerText = "Connected";

            // Send all queued messages
            while (messageQueue.length > 0) {
                const message = messageQueue.shift();
                console.log("Sending queued message:", message);
                ws.send(message);
            }
        };

        ws.onmessage = (event) => {
            try {
                const { type, data } = JSON.parse(event.data);
                console.log("Data received from WebSocket:", { type, data });

                if (type === 'chartData') {
                    console.log("Received chart data:", data);
                    updateTimelineChart(timelineChart, data);
                } else if (type === 'oeeData') {
                    console.log("Received process data:", data);
                    updateProcessData(data.processData);
                    updateGauge(oeeGauge, data.oee, 'oeeValue');
                    updateGauge(availabilityGauge, data.availability, 'availabilityValue');
                    updateGauge(performanceGauge, data.performance, 'performanceValue');
                    updateGauge(qualityGauge, data.quality, 'qualityValue');
                } else if (type === 'machineData') {
                    if (Array.isArray(data)) {
                        console.log("Received machine data:", data);
                        updateInterruptionTable(data);
                    } else {
                        console.error("Received machine data is not an array");
                    }
                } else if (type === 'ratingsData') {
                    console.log("Received ratings data:", data);
                    updateRatings(data);
                } else {
                    console.error("Invalid data received from WebSocket:", { type, data });
                }
            } catch (error) {
                console.error("Error processing WebSocket message:", error);
            }
        };

        ws.onclose = (event) => {
            console.log("WebSocket connection closed. Code:", event.code, "Reason:", event.reason);
            document.getElementById("status").innerText = "Disconnected";
            setTimeout(connectWebSocket, reconnectInterval); // Attempt reconnection after interval
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
        const processData = getCurrentProcessData();
        if (processData) {
            updateProcessData(processData);
        }
        const machineData = getCurrentMachineData();
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

    fetch('/ratings')
        .then(response => response.json())
        .then(ratings => updateRatings(ratings))
        .catch(error => console.error('Error fetching ratings:', error));
});

let currentProcessData = null; // Store the current process data
let currentMachineData = null; // Store the current machine data
let currentChartData = null; // Store the current chart data

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
        console.error(`Element with ID ${valueElementId} not found`);
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
            <td class="droppable" data-id="${entry.ProcessOrderID}" data-value="${entry.ID}">${entry.Reason || 'N/A'}</td>
            <td>${entry.ManuellKorrektur || 'N/A'}</td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.droppable').forEach(cell => {
        cell.addEventListener('drop', drop);
        cell.addEventListener('dragover', allowDrop);
    });
}

function updateRatings(ratings) {
    const ratingsContainer = document.getElementById('ratings');
    ratingsContainer.innerHTML = ''; // Clear existing ratings

    ratings.forEach(rating => {
        const label = document.createElement('span');
        label.className = 'rating-label';
        label.draggable = true;
        label.dataset.rating = rating.description;
        label.style.backgroundColor = rating.color;
        label.textContent = rating.description;
        label.addEventListener('dragstart', drag);
        ratingsContainer.appendChild(label);
    });
}

function allowDrop(event) {
    event.preventDefault();
}

function drag(event) {
    event.dataTransfer.setData("text", event.target.getAttribute('data-rating'));
}

function drop(event) {
    event.preventDefault();
    const rating = event.dataTransfer.getData("text");
    const processOrderId = event.target.getAttribute('data-id');
    const valueId = event.target.getAttribute('data-value');

    console.log(`Process Order ID: ${processOrderId}, Value ID: ${valueId}, Rating: ${rating}`);

    // Update the Reason cell with the dropped rating
    event.target.textContent = rating;

    // Send the updated data to the backend via WebSocket
    const updatedData = {
        ProcessOrderID: processOrderId,
        ID: valueId,
        Reason: rating
    };

    // Make sure ws is defined and open before sending the message
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'updateRating', data: updatedData }));
    } else {
        console.error("WebSocket is not open. Queueing message.");
        messageQueue.push(JSON.stringify({ type: 'updateRating', data: updatedData }));
    }

    // Optional: Update the interruption table locally if needed
    currentMachineData.forEach(entry => {
        if (entry.ID === valueId) {
            entry.Reason = rating;
        }
    });
}