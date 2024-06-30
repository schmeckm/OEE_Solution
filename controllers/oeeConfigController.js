const fs = require('fs');
const path = require('path');
const oeeConfigPath = path.join(__dirname, '../config/oeeConfig.json');
let oeeConfig = JSON.parse(fs.readFileSync(oeeConfigPath, 'utf-8'));

exports.getOeeConfig = (req, res) => {
    res.json(oeeConfig);
};

exports.postOeeConfig = (req, res) => {
    try {
        oeeConfig = JSON.parse(req.body);
        fs.writeFileSync(oeeConfigPath, JSON.stringify(oeeConfig, null, 2));
        res.json({ message: 'oeeConfig.json saved successfully.' });
    } catch (error) {
        res.status(400).json({ message: 'Invalid JSON format' });
    }
};