const fs = require('fs');
const path = require('path');
const structurePath = path.join(__dirname, '../config/structure.json');
let structure = JSON.parse(fs.readFileSync(structurePath, 'utf-8'));

exports.getStructure = (req, res) => {
    res.json(structure);
};

exports.postStructure = (req, res) => {
    try {
        structure = JSON.parse(req.body);
        fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2));
        res.json({ message: 'structure.json saved successfully.' });
    } catch (error) {
        res.status(400).json({ message: 'Invalid JSON format' });
    }
};