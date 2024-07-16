document.addEventListener("DOMContentLoaded", async() => {
    const ws = new WebSocket(`ws://${window.location.host}`);

    ws.onopen = () => {
        console.log("WebSocket connection opened");
        document.getElementById("status").innerText = "WebSocket Status: Connected";
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data && data.processData) {
            console.log("Received data:", data); // Debugging-Log
            updateProcessData(data.processData);
            updateGauge(oeeGauge, data.oee, 'oeeValue');
            updateGauge(availabilityGauge, data.availability, 'availabilityValue');
            updateGauge(performanceGauge, data.performance, 'performanceValue');
            updateGauge(qualityGauge, data.quality, 'qualityValue');
            updateTimelineChart(timelineChart, data.processData);
        } else {
            console.error("Invalid data received from WebSocket:", data);
        }
    };

    ws.onclose = () => {
        console.log("WebSocket connection closed");
        document.getElementById("status").innerText = "WebSocket Status: Disconnected";
    };

    ws.onerror = (error) => {
        console.error(`WebSocket error: ${error.message}`);
        document.getElementById("status").innerText = "WebSocket Status: Error";
    };

    const oeeGauge = initGauge('oeeGauge', 'OEE');
    const availabilityGauge = initGauge('availabilityGauge', 'Availability');
    const performanceGauge = initGauge('performanceGauge', 'Performance');
    const qualityGauge = initGauge('qualityGauge', 'Quality');
    const timelineChart = initTimelineChart('timelineChart');

    document.getElementById("timeZone").addEventListener("change", (event) => {
        updateTimeZone(event.target.value);
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

function updateProcessData(processData) {
    const timeZone = document.getElementById("timeZone").value;

    document.getElementById("orderNumber").innerText = processData.ProcessOrderNumber;
    document.getElementById("startTime").innerText = moment.tz(processData.StartTime, timeZone).format("YYYY-MM-DD HH:mm:ss");
    document.getElementById("endTime").innerText = moment.tz(processData.EndTime, timeZone).format("YYYY-MM-DD HH:mm:ss");
    document.getElementById("plannedQuantity").innerText = processData.plannedProduction;
    document.getElementById("plannedDowntime").innerText = processData.plannedDowntime;
    document.getElementById("unplannedDowntime").innerText = processData.unplannedDowntime;
    document.getElementById("lineCode").innerText = processData.LineCode || 'N/A';
}

function initGauge(elementId, label) {
    const opts = {
        angle: 0.15,
        lineWidth: 0.2,
        radiusScale: 0.7, // Adjust radius scale to control gauge size
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
            labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
            datasets: [{
                    label: 'Planned Downtime',
                    backgroundColor: '#f44336',
                    data: Array(11).fill(0)
                },
                {
                    label: 'Unplanned Downtime',
                    backgroundColor: '#ffeb3b',
                    data: Array(11).fill(0)
                },
                {
                    label: 'Production',
                    backgroundColor: '#4caf50',
                    data: Array(11).fill(0)
                }
            ]
        },
        options: {
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Duration (minutes)'
                    }
                }
            }
        }
    });
}

function updateTimelineChart(chart, processData) {
    if (processData.plannedDowntime && processData.unplannedDowntime && processData.production) {
        chart.data.datasets[0].data = processData.plannedDowntime; // Assuming processData has an array of downtime values
        chart.data.datasets[1].data = processData.unplannedDowntime; // Assuming processData has an array of downtime values
        chart.data.datasets[2].data = processData.production; // Assuming processData has an array of production values
        chart.update();
    } else {
        console.error("Missing data in processData:", processData);
    }
}

function updateTimeZone(timeZone) {
    const startTimeElement = document.getElementById("startTime");
    const endTimeElement = document.getElementById("endTime");

    const startTime = startTimeElement.innerText;
    const endTime = endTimeElement.innerText;

    startTimeElement.innerText = moment.tz(startTime, timeZone).format("YYYY-MM-DD HH:mm:ss");
    endTimeElement.innerText = moment.tz(endTime, timeZone).format("YYYY-MM-DD HH:mm:ss");
}

function updateCurrentTime() {
    const timeZone = document.getElementById("timeZone").value;
    const currentTimeElement = document.getElementById("currentTime");
    currentTimeElement.innerText = moment().tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
}