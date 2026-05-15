const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'ebu_store_secret_key';

// --- MySQL Configuration (uses Railway env variables) ---
const dbConfig = {
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'ebu_store',
    port: process.env.MYSQLPORT || 3306
};

let pool;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Request Logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Initialize MySQL
async function initDB() {
    try {
        // First connect without database to create it if needed
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await connection.end();

        // Create pool with database
        pool = mysql.createPool(dbConfig);
        console.log('Connected to MySQL Database.');

        const [rows] = await pool.query('SHOW TABLES');
        
        // Setup Tables
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255),
            email VARCHAR(255) UNIQUE,
            username VARCHAR(255) UNIQUE,
            password VARCHAR(255),
            status VARCHAR(50) DEFAULT 'pending',
            role VARCHAR(50) DEFAULT 'user'
        )`.replace('AUTOINCREMENT', 'AUTO_INCREMENT'));

        await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255),
            category VARCHAR(255),
            serial VARCHAR(255),
            buyPrice VARCHAR(255),
            sellPrice VARCHAR(255),
            stock VARCHAR(255)
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS sales (
            id INT PRIMARY KEY AUTO_INCREMENT,
            date VARCHAR(255),
            customer VARCHAR(255),
            product VARCHAR(255),
            qty VARCHAR(255),
            total VARCHAR(255),
            status VARCHAR(50),
            balance VARCHAR(255),
            is_deleted TINYINT(1) DEFAULT 0
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS expenses (
            id INT PRIMARY KEY AUTO_INCREMENT,
            date VARCHAR(255),
            category VARCHAR(255),
            amount VARCHAR(255),
            description TEXT,
            status VARCHAR(50),
            balance VARCHAR(255),
            is_deleted TINYINT(1) DEFAULT 0
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS customers (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255),
            email VARCHAR(255),
            phone VARCHAR(255),
            address TEXT,
            history TEXT,
            totalSpent VARCHAR(255)
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS invoices (
            id INT PRIMARY KEY AUTO_INCREMENT,
            invoiceNo VARCHAR(255),
            customer VARCHAR(255),
            date VARCHAR(255),
            amount VARCHAR(255),
            status VARCHAR(50),
            balance VARCHAR(255),
            is_deleted TINYINT(1) DEFAULT 0
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS settings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            setting_key VARCHAR(255) UNIQUE,
            setting_value TEXT
        )`);
        try { await pool.query("ALTER TABLE expenses ADD COLUMN is_deleted TINYINT(1) DEFAULT 0"); } catch(e) {}
        try { await pool.query("ALTER TABLE sales ADD COLUMN is_deleted TINYINT(1) DEFAULT 0"); } catch(e) {}

        // Add missing columns if tables already exist
        try { await pool.query("ALTER TABLE expenses ADD COLUMN balance VARCHAR(255)"); } catch(e) {}
        try { await pool.query("ALTER TABLE sales ADD COLUMN balance VARCHAR(255)"); } catch(e) {}

        // Default Admin
        const [adminRows] = await pool.query("SELECT * FROM users WHERE username = 'admin'");
        if (adminRows.length === 0) {
            const hashedPass = bcrypt.hashSync('password', 10);
            await pool.query("INSERT INTO users (name, email, username, password, status, role) VALUES (?, ?, ?, ?, ?, ?)", 
                ['Master Admin', 'admin@ebustore.com', 'admin', hashedPass, 'approved', 'admin']);
        }

    } catch (err) {
        console.error('MySQL Initialization Error:', err.message);
        console.log('Please ensure MySQL is running and credentials in server.js are correct.');
    }
}

initDB();

// Auth Routes
app.post('/api/register', async (req, res) => {
    const { name, email, username, password } = req.body;
    const hashedPass = bcrypt.hashSync(password, 10);
    try {
        await pool.query("INSERT INTO users (name, email, username, password) VALUES (?, ?, ?, ?)", 
            [name, email, username, hashedPass]);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Username or Email already exists' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query("SELECT * FROM users WHERE email = ? OR username = ?", [email, email]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'User not found' });
        if (user.status !== 'approved') return res.status(403).json({ error: 'Account pending approval' });
        
        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
            res.json({ success: true, token, user: { name: user.name, username: user.username, role: user.role } });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token missing' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalid' });
        req.user = user;
        next();
    });
};

app.put('/api/users/me/password', authenticateToken, async (req, res) => {
    const { password } = req.body;
    const hashedPass = bcrypt.hashSync(password, 10);
    try {
        await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPass, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generic API Endpoints (CRUD)
const createEndpoints = (table) => {
    app.get(`/api/${table}`, async (req, res) => {
        try {
            const [rows] = await pool.query(`SELECT * FROM ${table}`);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post(`/api/${table}`, async (req, res) => {
        try {
            const keys = Object.keys(req.body);
            const values = Object.values(req.body);
            const placeholders = keys.map(() => '?').join(',');
            const [result] = await pool.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, values);
            res.json({ id: result.insertId, ...req.body });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.put(`/api/${table}/:id`, async (req, res) => {
        try {
            const keys = Object.keys(req.body);
            const values = [...Object.values(req.body), req.params.id];
            const setClause = keys.map(k => `${k} = ?`).join(',');
            await pool.query(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete(`/api/${table}/:id`, async (req, res) => {
        try {
            await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};

['inventory', 'sales', 'expenses', 'customers', 'invoices'].forEach(createEndpoints);

// User Management
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, name, email, username, status FROM users WHERE username != 'admin'");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/status', async (req, res) => {
    try {
        await pool.query("UPDATE users SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/:key', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM settings WHERE setting_key = ?", [req.params.key]);
        res.json(rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    const { setting_key, setting_value } = req.body;
    try {
        await pool.query("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?", 
            [setting_key, setting_value, setting_value]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/password', async (req, res) => {
    const { password } = req.body;
    const hashedPass = bcrypt.hashSync(password, 10);
    try {
        await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPass, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
