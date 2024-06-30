const express = require('express');const router = express.Router();const structureController = require('../controllers/structureController'); 
router.get('/', structureController.getStructure);router.post('/', structureController.postStructure); 
module.exports = router; 
