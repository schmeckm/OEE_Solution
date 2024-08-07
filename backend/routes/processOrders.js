const express = require('express');
const router = express.Router();
const { loadProcessOrders, saveProcessOrders } = require('../services/processOrderService');

router.get('/', (req, res) => {
    const data = loadProcessOrders();
    res.json(data);
});

router.post('/', (req, res) => {
    const data = loadProcessOrders();
    const newData = req.body;
    data.push(newData);
    saveProcessOrders(data);
    res.status(201).json({ message: 'Process order added successfully' });
});

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