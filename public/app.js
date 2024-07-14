// app.js

// Wait until the DOM is fully loaded before executing the script
document.addEventListener("DOMContentLoaded", async() => {
    // Create a new WebSocket connection to the server
    const ws = new WebSocket(`ws://${window.location.host}`);

    // Event handler for when the WebSocket connection is opened
    ws.onopen = () => {
        console.log("WebSocket connection opened");
        document.getElementById("status").innerText = "WebSocket Status: Connected";
    };

    // Event handler for when a message is received from the WebSocket server
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data); // Parse the JSON data from the server

        // Ensure data is properly structured
        if (data && data.processData) {
            // Safely update the process data if it exists
            document.getElementById("orderNumber").innerText = data.processData.ProcessOrderNumber || 'N/A';
            document.getElementById("startTime").innerText = data.processData.StartTime || 'N/A';
            document.getElementById("endTime").innerText = data.processData.EndTime || 'N/A';
            document.getElementById("plannedQuantity").innerText = data.processData.plannedProduction || 'N/A';
            document.getElementById("plannedDowntime").innerText = data.processData.plannedDowntime || 'N/A';
            document.getElementById("unplannedDowntime").innerText = data.processData.unplannedDowntime || 'N/A';

            // Update the gauges
            updateGauge(oeeGauge, data.oee);
            updateGauge(availabilityGauge, data.availability);
            updateGauge(performanceGauge, data.performance);
            updateGauge(qualityGauge, data.quality);

            // Update the timeline
            updateTimelineChart(timelineChart, data.processData);
        } else {
            console.error("Invalid data received from WebSocket:", data);
        }
    };

    // Event handler for when the WebSocket connection is closed
    ws.onclose = () => {
        console.log("WebSocket connection closed");
        document.getElementById("status").innerText = "WebSocket Status: Disconnected";
    };

    // Event handler for when there is an error with the WebSocket connection
    ws.onerror = (error) => {
        console.error(`WebSocket error: ${error.message}`);
        document.getElementById("status").innerText = "WebSocket Status: Error";
    };

    // Initialize Chart.js gauges
    const oeeGauge = initGauge('oeeGauge', 'OEE');
    const availabilityGauge = initGauge('availabilityGauge', 'Availability');
    const performanceGauge = initGauge('performanceGauge', 'Performance');
    const qualityGauge = initGauge('qualityGauge', 'Quality');

    // Initialize Chart.js timeline
    const timelineChart = initTimelineChart('timelineChart');
});

// Function to initialize a Chart.js gauge
function initGauge(elementId, label) {
    return new Chart(document.getElementById(elementId), {
        type: 'doughnut',
        data: {
            labels: [label],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#4caf50', '#ccc'],
                borderWidth: 0
            }]
        },
        options: {
            circumference: 180,
            rotation: 270,
            cutout: '70%',
            plugins: {
                tooltip: { enabled: false }
            },
            animation: { animateRotate: false, animateScale: true }
        }
    });
}

// Function to update a Chart.js gauge
function updateGauge(chart, value) {
    chart.data.datasets[0].data[0] = value;
    chart.data.datasets[0].data[1] = 100 - value;
    chart.update();
}

// Function to initialize a Chart.js timeline
function initTimelineChart(elementId) {
    return new Chart(document.getElementById(elementId), {
        type: 'bar',
        data: {
            labels: ['Timeline'],
            datasets: [{
                    label: 'Planned Downtime',
                    backgroundColor: '#f44336',
                    data: [0]
                },
                {
                    label: 'Unplanned Downtime',
                    backgroundColor: '#ffeb3b',
                    data: [0]
                },
                {
                    label: 'Production',
                    backgroundColor: '#4caf50',
                    data: [0]
                }
            ]
        },
        options: {
            indexAxis: 'y',
            scales: {
                x: {
                    stacked: true,
                    min: 8,
                    max: 17
                },
                y: {
                    stacked: true
                }
            }
        }
    });
}

// Function to update the timeline chart
function updateTimelineChart(chart, processData) {
    chart.data.datasets[0].data[0] = processData.plannedDowntime;
    chart.data.datasets[1].data[0] = processData.unplannedDowntime;
    chart.data.datasets[2].data[0] = processData.plannedProduction - processData.plannedDowntime - processData.unplannedDowntime;
    chart.update();
}