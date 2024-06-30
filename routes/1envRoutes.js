const express = require('express');const router = express.Router();const envController = require('../controllers/envController'); 
router.get('/', envController.getEnv);router.post('/', envController.postEnv); 
module.exports = router; 
