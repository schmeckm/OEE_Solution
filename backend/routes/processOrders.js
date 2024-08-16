const express = require('express');
const router = express.Router();
const { loadProcessOrders, saveProcessOrders } = require('../services/processOrderService');

/**
 * @swagger
 * tags:
 *   name: Process Orders
 *   description: API for managing process orders
 */

/**
 * @swagger
 * /processorders:
 *   get:
 *     summary: Get all process orders
 *     tags: [Process Orders]
 *     description: Retrieve a list of all process orders.
 *     responses:
 *       200:
 *         description: A list of process orders.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', (req, res) => {
    const data = loadProcessOrders();
    res.json(data);
});

/**
 * @swagger
 * /processorders:
 *   post:
 *     summary: Add a new process order
 *     tags: [Process Orders]
 *     description: Create a new process order.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_id:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Process order added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post('/', (req, res) => {
    const data = loadProcessOrders();
    const newData = req.body;
    data.push(newData);
    saveProcessOrders(data);
    res.status(201).json({ message: 'Process order added successfully' });
});

/**
 * @swagger
 * /processorders/{id}:
 *   put:
 *     summary: Update an existing process order
 *     tags: [Process Orders]
 *     description: Update the details of an existing process order.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The process order ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Process order updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Process order not found.
 */
router.put('/:id', (req, res) => {
    const data = loadProcessOrders();
    const id = parseInt(req.params.id);
    const updatedData = req.body;
    const index = data.findIndex(item => item.order_id === id);
    if (index !== -1) {
        data[index] = updatedData;
        saveProcessOrders(data);
        res.status(200).json({ message: 'Process order updated successfully' });
    } else {
        res.status(404).json({ message: 'Process order not found' });
    }
});

/**
 * @swagger
 * /processorders/{id}:
 *   delete:
 *     summary: Delete a process order
 *     tags: [Process Orders]
 *     description: Remove a process order from the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The process order ID.
 *     responses:
 *       200:
 *         description: Process order deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Process order not found.
 */
router.delete('/:id', (req, res) => {
    const data = loadProcessOrders();
    const id = parseInt(req.params.id);
    const newData = data.filter(item => item.order_id !== id);
    if (data.length !== newData.length) {
        saveProcessOrders(newData);
        res.status(200).json({ message: 'Process order deleted successfully' });
    } else {
        res.status(404).json({ message: 'Process order not found' });
    }
});

module.exports = router;