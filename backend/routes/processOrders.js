const express = require("express");
const router = express.Router();
const {
  loadProcessOrders,
  saveProcessOrders,
} = require("../services/processOrderService");

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
router.get("/", (req, res) => {
  const data = loadProcessOrders(); // Load all process orders from the service
  res.json(data); // Return the list of process orders as a JSON response
});

/**
 * @swagger
 * /processorders/rel:
 *   get:
 *     summary: Get all process orders with status REL for a specific machine
 *     tags: [Process Orders]
 *     description: Retrieve a list of all process orders with status REL for a specific machine.
 *     parameters:
 *       - in: query
 *         name: machineId
 *         required: false
 *         schema:
 *           type: string
 *         description: The machine ID to filter process orders.
 *       - in: query
 *         name: mark
 *         required: false
 *         schema:
 *           type: boolean
 *         description: If true, mark the filtered orders with an 'X'.
 *     responses:
 *       200:
 *         description: A list of process orders with status REL for the specified machine.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/rel", (req, res) => {
  const mark = req.query.mark === "true"; // Check if the mark query parameter is set to true
  const machineId = req.query.machineId; // Get the machineId from the query parameter

  let data = loadProcessOrders(); // Load all process orders

  // Filter process orders by status REL and optionally by machineId
  data = data.filter(
    (order) =>
      order.ProcessOrderStatus === "REL" &&
      (!machineId || order.machine_id === machineId)
  );

  // Optionally mark the filtered orders
  if (mark) {
    data = data.map((order) => {
      order.marked = "X"; // Set a mark, such as 'X'
      return order;
    });
  }

  res.json(data); // Return the filtered and optionally marked list of process orders
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
router.post("/", (req, res) => {
  const data = loadProcessOrders(); // Load existing process orders
  const newData = req.body; // Get the new process order data from the request body
  data.push(newData); // Add the new process order to the list
  saveProcessOrders(data); // Save the updated list of process orders
  res.status(201).json({ message: "Process order added successfully" }); // Send a success response
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
router.put("/:id", (req, res) => {
  const data = loadProcessOrders(); // Load all process orders
  const id = parseInt(req.params.id); // Get the process order ID from the URL parameter
  const updatedData = req.body; // Get the updated data from the request body
  const index = data.findIndex((item) => item.order_id === id); // Find the index of the process order to update
  if (index !== -1) {
    data[index] = updatedData; // Update the process order with the new data
    saveProcessOrders(data); // Save the updated list of process orders
    res.status(200).json({ message: "Process order updated successfully" }); // Send a success response
  } else {
    res.status(404).json({ message: "Process order not found" }); // Send a 404 response if the process order is not found
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
router.delete("/:id", (req, res) => {
  const data = loadProcessOrders(); // Load all process orders
  const id = parseInt(req.params.id); // Get the process order ID from the URL parameter
  const newData = data.filter((item) => item.order_id !== id); // Filter out the process order to delete
  if (data.length !== newData.length) {
    saveProcessOrders(newData); // Save the updated list of process orders
    res.status(200).json({ message: "Process order deleted successfully" }); // Send a success response
  } else {
    res.status(404).json({ message: "Process order not found" }); // Send a 404 response if the process order is not found
  }
});

module.exports = router; // Export the router for use in other parts of the application
