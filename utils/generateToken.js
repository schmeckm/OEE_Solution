const jwt = require('jsonwebtoken');

// Replace with your secret key
const SECRET_KEY = 'your_secret_key';

// Payload data to be included in the token
const payload = {
    userId: '12345',
    username: 'exampleUser'
};

// Options for the token, such as expiration
const options = {
    expiresIn: '1h' // Token expires in 1 hour
};

// Generate the token
const token = jwt.sign(payload, SECRET_KEY, options);

console.log('Generated JWT Token:', token);