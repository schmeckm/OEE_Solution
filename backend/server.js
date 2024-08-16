/**
 * Module dependencies.
 */
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('ws');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { loadUsers, saveUsers } = require('./services/userService');
const { authenticateToken, authorizeRole } = require('./middlewares/auth');

/**
 * Load environment variables from .env file.
 * Ensures that environment-specific configurations are available throughout the application.
 */
dotenv.config();

const { defaultLogger } = require('./utils/logger');
const { logRetentionDays } = require('./config/config');
const { setWebSocketServer } = require('./src/oeeProcessor');
const startLogCleanupJob = require('./cronJobs/logCleanupJob');
const initializeMqttClient = require('./src/mqttClientSetup');
const handleWebSocketConnections = require('./websocket/webSocketHandler');
const gracefulShutdown = require('./src/shutdown');
const registerApiRoutes = require('./routes/apiRoutes'); // Centralized API route registration

const app = express();
const port = process.env.PORT || 3000;

/**
 * Security Middleware
 * - `helmet()`: Sets various HTTP headers to secure the app.
 * - `express.json()`: Parses incoming requests with JSON payloads and limits payload size to prevent DoS attacks.
 * - `express.urlencoded()`: Parses incoming requests with URL-encoded payloads and limits payload size.
 * - `express.static()`: Serves static files from the 'public' directory.
 * - `rateLimit`: Limits the number of requests from a single IP to prevent DoS attacks.
 */
app.use(helmet()); // Set security-related HTTP headers
app.use(express.json({ limit: '10kb' })); // Limit payload size to prevent DoS attacks
app.use(express.urlencoded({ extended: true, limit: '10kb' })); // Limit URL-encoded data size
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Rate limiting to prevent DoS attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

/**
 * Swagger Setup
 */
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API Documentation',
            version: '1.0.0',
            description: 'This is the API documentation for the REST API.',
        },
        servers: [{
            url: `http://localhost:${port}/api/v1`, // Ihre Basis-URL anpassen
        }, ],
    },
    apis: ['./routes/*.js'], // Pfad zu Ihren API-Routen
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

/**
 * Register API Endpoints
 * Centralized function to register all API routes, including OEE and additional endpoints.
 */
registerApiRoutes(app);

defaultLogger.info('Logger initialized successfully.');

/**
 * User Registration Endpoint
 * Allows new users to register with a username, password, and role.
 * Password is hashed before saving to the JSON file.
 */
app.post('/register', async(req, res) => {
    const { username, password, role } = req.body;
    const users = loadUsers();

    // Check if the username already exists
    if (users.some(user => user.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Add the new user
    const newUser = {
        id: users.length ? Math.max(...users.map(user => user.id)) + 1 : 1,
        username,
        password: hashedPassword,
        role
    };
    users.push(newUser);
    saveUsers(users);

    res.status(201).json({ message: 'User registered successfully' });
});

/**
 * User Login Endpoint
 * Authenticates the user and returns a JWT token if successful.
 */
app.post('/login', async(req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();

    // Find the user
    const user = users.find(user => user.username === username);
    if (!user) {
        return res.status(400).json({ message: 'User not found' });
    }

    // Verify the password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).json({ message: 'Invalid password' });
    }

    // Generate a JWT token
    const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.json({ accessToken });
});

/**
 * Protected Admin Route
 * Example of a protected route that only users with the 'admin' role can access.
 */
app.get('/admin', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json({ message: 'Welcome, Admin!' });
});

/**
 * Cron Job for Log Cleanup
 * Schedules a daily job to clean up old logs based on the retention policy.
 */
startLogCleanupJob(logRetentionDays);

/**
 * MQTT Client Initialization
 * Initializes the MQTT client for handling MQTT-based communication.
 * Logs success or failure of the initialization.
 */
const mqttClient = initializeMqttClient();

/**
 * HTTP Server Initialization
 * Starts the Express server on the specified port.
 * Logs the success of the server start.
 */
const server = app.listen(port, () => {
    defaultLogger.info(`Server is running on port ${port}`);
});

/**
 * WebSocket Server Setup
 * Initializes the WebSocket server, attaches it to the HTTP server, 
 * and delegates connection handling to a dedicated function.
 */
const wss = new Server({ server });

/**
 * Handle WebSocket Connections
 * Delegates the handling of WebSocket connections, messages, and disconnections 
 * to an external handler function for modularity and clarity.
 */
handleWebSocketConnections(wss);

/**
 * Associate WebSocket Server with OEE Processor
 * Sets the WebSocket server instance within the OEE processor for 
 * further communication handling.
 */
setWebSocketServer(wss);

/**
 * Graceful Shutdown Handling
 * Listens for termination signals (SIGTERM, SIGINT) to gracefully 
 * shut down the server and disconnect the MQTT client.
 * Ensures that the server closes properly without data loss.
 */
process.on('SIGTERM', () => gracefulShutdown(server, mqttClient, 'SIGTERM'));
process.on('SIGINT', () => gracefulShutdown(server, mqttClient, 'SIGINT'));