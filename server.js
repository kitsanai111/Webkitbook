const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const app = express();

// ตั้งค่า View Engine ให้เป็น EJS
app.set('view engine', 'ejs');

// ตั้งค่า Body Parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ตั้งค่า Static Folder
app.use(express.static('public'));

// ตั้งค่า Session
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// การเชื่อมต่อฐานข้อมูล
const db = require('./database');


// การตั้งค่า Multer สำหรับการอัปโหลดไฟล์
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware เช็คการล็อกอิน
function isLoggedIn(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
}

// หน้าแรก - Feed สาธารณะ
app.get('/feed', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT uploads.*, users.username
            FROM uploads
            INNER JOIN users ON uploads.user_id = users.id
            WHERE uploads.is_public = TRUE
        `);
        res.render('index', { session: req.session, uploads: rows });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});

// หน้า Dashboard ของผู้ใช้
app.get('/dashboard', isLoggedIn, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT uploads.*, users.username
            FROM uploads
            INNER JOIN users ON uploads.user_id = users.id
            WHERE uploads.user_id = ?
        `, [req.session.userId]);

        res.render('dashboard', { session: req.session, uploads: rows });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});

// หน้า Login
app.get('/login', (req, res) => {
    res.render('login');
});

// หน้า Register
app.get('/register', (req, res) => {
    res.render('register');
});

// การ Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
        return res.send('<h2>User not found. <a href="/login">Try again</a></h2>');
    }

    const isMatch = await bcrypt.compare(password, rows[0].password);
    if (!isMatch) {
        return res.send('<h2>Incorrect password. <a href="/login">Try again</a></h2>');
    }

    req.session.userId = rows[0].id;
    req.session.username = rows[0].username;
    res.redirect('/feed');
});

// การ Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// การ Register
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    res.redirect('/login');
});

// การอัปโหลดโพสต์
app.post('/upload', isLoggedIn, upload.single('file'), async (req, res) => {
    const { message, is_public } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const isPublic = is_public === 'true';

    try {
        await db.execute(
            'INSERT INTO uploads (user_id, message, file_path, is_public) VALUES (?, ?, ?, ?)',
            [req.session.userId, message, filePath, isPublic]
        );
        res.redirect('/feed');
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while uploading.');
    }
});

// เริ่มเซิร์ฟเวอร์
app.listen(3000, '192.168.1.110', () => {
    console.log('Server running on http://192.168.1.110:3000');
});

