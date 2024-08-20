const express = require('express');
const bcrypt = require('bcrypt');
const { loadUsers, saveUsers } = require('../services/userService'); // Assume these functions exist to handle file operations
const { errorLogger } = require('../utils/logger'); // Logger for error handling

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: API for managing users
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     description: Retrieve a list of all users.
 *     responses:
 *       200:
 *         description: A list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', (req, res) => {
    try {
        const users = loadUsers(); // Load all users
        res.json(users); // Send them as a response
    } catch (error) {
        errorLogger.error(`Error in /users endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a specific user
 *     tags: [Users]
 *     description: Retrieve a single user by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The user ID.
 *     responses:
 *       200:
 *         description: A user object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: User not found.
 */
router.get('/:id', (req, res) => {
    try {
        const users = loadUsers(); // Load all users
        const user = users.find(u => u.id === parseInt(req.params.id)); // Find the user by ID
        if (user) {
            res.json(user); // Send the user as a response
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        errorLogger.error(`Error in /users/${req.params.id} get endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     description: Create a new user and save it to the list.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 */
router.post('/', async(req, res) => {
    try {
        const users = loadUsers(); // Load current users
        const { username, password, role } = req.body;

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
        saveUsers(users); // Save the updated list of users
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
        errorLogger.error(`Error in /users post endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update an existing user
 *     tags: [Users]
 *     description: Update the details of an existing user.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The user ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *       404:
 *         description: User not found.
 */
router.put('/:id', async(req, res) => {
    try {
        const users = loadUsers(); // Load current users
        const id = parseInt(req.params.id);
        const { username, password, role } = req.body;
        const index = users.findIndex(user => user.id === id);

        if (index !== -1) {
            // Update the user's data
            const updatedUser = {
                ...users[index],
                username: username || users[index].username,
                password: password ? await bcrypt.hash(password, 10) : users[index].password,
                role: role || users[index].role
            };
            users[index] = updatedUser;
            saveUsers(users); // Save the updated list of users
            res.json({ message: 'User updated successfully', user: updatedUser });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        errorLogger.error(`Error in /users/${req.params.id} put endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     description: Delete a specific user by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The user ID.
 *     responses:
 *       200:
 *         description: User deleted successfully.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', (req, res) => {
    try {
        let users = loadUsers(); // Load current users
        const id = parseInt(req.params.id);
        const initialLength = users.length;
        users = users.filter(user => user.id !== id); // Filter out the user to delete

        if (users.length === initialLength) {
            return res.status(404).json({ message: 'User not found' });
        }

        saveUsers(users); // Save the updated list of users
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        errorLogger.error(`Error in /users/${req.params.id} delete endpoint: ${error.message}`);
        res.status(500).send(error.message);
    }
});

module.exports = router;