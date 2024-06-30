const express = require('express');const router = express.Router();const oeeConfigController = require('../controllers/oeeConfigController'); 
router.get('/', oeeConfigController.getOeeConfig);router.post('/', oeeConfigController.postOeeConfig); 
module.exports = router; 
