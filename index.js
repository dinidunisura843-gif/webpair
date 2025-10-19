const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const code = require('./pair');
require('events').EventEmitter.defaultMaxListeners = 500;

const app = express();
const __path = process.cwd();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Route handlers
app.use('/code', code);

app.get('/', async (req, res) => {
    res.sendFile(path.join(__path, 'pair.html'));
});

app.listen(PORT, () => {
    console.log(`⏩ Server running on http://localhost:${PORT}`);
});

module.exports = app;
