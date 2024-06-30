const fs = require('fs');
const envPath = './.env';

exports.getEnv = (req, res) => {
    res.send(fs.readFileSync(envPath, 'utf-8'));
};

exports.postEnv = (req, res) => {
    fs.writeFileSync(envPath, req.body);
    res.json({ message: '.env saved successfully.' });
};