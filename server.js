require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- MongoDB Schemas ---
const UserSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    name: String,
    role: String,
    needs: [String]
});
const User = mongoose.model('User', UserSchema);

// Global Settings Schema
const SettingsSchema = new mongoose.Schema({
    id: { type: String, default: 'global' },
    portalName: { type: String, default: 'SkillForge Live' },
    maintenanceMode: { type: Boolean, default: false }
});
const Settings = mongoose.model('Settings', SettingsSchema);

// --- MongoDB Connection & Auto-Seeding ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB Connected');

        // Auto-create users collection and default tokens if database is empty
        try {
            const univExists = await User.findOne({ role: 'university' });
            if (!univExists) {
                await User.create({
                    token: 'UNIV2026',
                    name: 'State University',
                    role: 'university',
                    needs: []
                });
                console.log('✅ Auto-seeded University token: UNIV2026');
            }

            const studentExists = await User.findOne({ role: 'student' });
            if (!studentExists) {
                await User.create({
                    token: 'STUDENT123',
                    name: 'Alex Student',
                    role: 'student',
                    needs: ['Web Development', 'Data Science']
                });
                console.log('✅ Auto-seeded Student token: STUDENT123');
            }
        } catch (seedErr) {
            console.error('Auto-seeding error:', seedErr);
        }
    })
    .catch(err => console.log('MongoDB connection error:', err));

// --- API Routes ---
app.post('/api/auth', async (req, res) => {
    try {
        const { token } = req.body;
        if (token === process.env.MASTER_ADMIN_TOKEN) {
            return res.json({ success: true, role: 'admin', name: 'Master Admin' });
        }
        const user = await User.findOne({ token });
        if (user) return res.json({ success: true, role: user.role, name: user.name, data: user });
        res.status(401).json({ success: false, message: 'Invalid Token' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during authentication' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne({ id: 'global' });
        if (!settings) {
            settings = await Settings.create({});
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// --- Real-time Socket.io Logic ---
let activeUsers = {};

io.on('connection', (socket) => {
    socket.on('user_login', (data) => {
        if (data.role !== 'admin') {
            activeUsers[socket.id] = { name: data.name, role: data.role, loginTime: new Date() };
            io.emit('admin_update_users', Object.values(activeUsers));
        }
    });

    socket.on('admin_broadcast', (message) => {
        io.emit('server_broadcast', message);
    });

    socket.on('admin_update_settings', async (newSettings) => {
        try {
            await Settings.findOneAndUpdate({ id: 'global' }, newSettings, { upsert: true });
            io.emit('settings_updated', newSettings); // Push to all connected clients
        } catch (err) {
            console.error('Error updating settings:', err);
        }
    });

    socket.on('disconnect', () => {
        if (activeUsers[socket.id]) {
            delete activeUsers[socket.id];
            io.emit('admin_update_users', Object.values(activeUsers));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));