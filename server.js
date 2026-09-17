require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, { 
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] } 
});

// --- Static Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- MongoDB Schemas ---
const UserSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    name: String,
    role: String,
    needs: [String]
});
const User = mongoose.model('User', UserSchema);

const SettingsSchema = new mongoose.Schema({
    id: { type: String, default: 'global' },
    portalName: { type: String, default: 'SkillForge Live Core' },
    maintenanceMode: { type: Boolean, default: false }
});
const Settings = mongoose.model('Settings', SettingsSchema);

const JobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    company: { type: String, required: true },
    skillRequired: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', JobSchema);

const ApplicationSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    studentName: { type: String, required: true },
    studentEmail: { type: String, required: true },
    skills: [String],
    matchScore: { type: Number, default: 0 },
    status: { type: String, default: 'Pending' }, // Pending, Shortlisted, Rejected
    appliedAt: { type: Date, default: Date.now }
});
const Application = mongoose.model('Application', ApplicationSchema);

function calculateMatch(studentSkills, requiredSkillString) {
    if (!studentSkills || !studentSkills.length || !requiredSkillString) return 0;
    const studentSet = new Set(studentSkills.map(s => s.toLowerCase().trim()));
    const requiredSkills = requiredSkillString.split(',').map(s => s.toLowerCase().trim());
    let matches = 0;
    requiredSkills.forEach(skill => { if (studentSet.has(skill)) matches++; });
    return Math.round((matches / requiredSkills.length) * 100);
}

// --- Database Seed ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/skillforge';
mongoose.connect(MONGO_URI).then(async () => {
    console.log('✅ Connected to MongoDB');
    if (!await User.findOne({ role: 'university' })) {
        await User.create({ token: 'UNIV2026', name: 'State University Node', role: 'university', needs: [] });
    }
    if (!await User.findOne({ role: 'student' })) {
        await User.create({ token: 'STUDENT123', name: 'Alex Vector (Student)', role: 'student', needs: ['Web Development', 'JavaScript'] });
    }
    if (await Job.countDocuments() === 0) {
        await Job.insertMany([
            { title: 'Full-Stack Neural Architect', company: 'CyberDynamics', skillRequired: 'Web Development, JavaScript' },
            { title: 'AI Quantum Data Analyst', company: 'AetherCore AI', skillRequired: 'Python, Data Science' }
        ]);
    }
    if (!await Settings.findOne({ id: 'global' })) {
        await Settings.create({ id: 'global', portalName: 'SkillForge Live Core', maintenanceMode: false });
    }
});

// --- REST Endpoints ---
app.post('/api/auth', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token required' });
        if (token === process.env.MASTER_ADMIN_TOKEN || token === 'ADMIN123') {
            return res.json({ success: true, role: 'admin', name: 'Master Command Admin' });
        }
        const user = await User.findOne({ token });
        if (user) return res.json({ success: true, role: user.role, name: user.name, data: user });
        res.status(401).json({ success: false, message: 'Invalid Access Token Matrix' });
    } catch (e) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.put('/api/user/skills', async (req, res) => {
    try {
        const { token, needs } = req.body;
        const updated = await User.findOneAndUpdate({ token }, { needs }, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: 'User node not found' });
        res.json({ success: true, needs: updated.needs });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.json({ success: true, jobs });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/jobs', async (req, res) => {
    try {
        const { title, company, skillRequired } = req.body;
        const newJob = await Job.create({ title, company, skillRequired });
        io.emit('new_job_posted', newJob);
        res.json({ success: true, job: newJob });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/jobs/:id', async (req, res) => {
    try {
        await Job.findByIdAndDelete(req.params.id);
        io.emit('job_deleted', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/applications', async (req, res) => {
    try {
        const { jobId, studentName, studentEmail, studentSkills } = req.body;
        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

        const matchScore = calculateMatch(studentSkills, job.skillRequired);
        const application = await Application.create({ jobId, studentName, studentEmail, skills: studentSkills, matchScore });
        const populatedApp = await Application.findById(application._id).populate('jobId');

        io.emit('new_application', populatedApp);
        res.json({ success: true, application: populatedApp });
    } catch (e) { res.status(500).json({ success: false, message: 'Application dispatch failed' }); }
});

app.get('/api/applications/:email', async (req, res) => {
    try {
        const applications = await Application.find({ studentEmail: req.params.email }).populate('jobId').sort({ appliedAt: -1 });
        res.json({ success: true, applications });
    } catch (e) { res.status(500).json({ success: false }); }
});

const fetchAllApps = async (req, res) => {
    try {
        const applications = await Application.find().populate('jobId').sort({ appliedAt: -1 });
        res.json({ success: true, applications });
    } catch (e) { res.status(500).json({ success: false }); }
};
app.get('/api/applications/all', fetchAllApps);
app.get('/api/university/applications', fetchAllApps);

app.put('/api/applications/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await Application.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('jobId');
        io.emit('application_status_updated', updated);
        res.json({ success: true, application: updated });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        res.json({ success: true, stats: { totalJobs: await Job.countDocuments(), totalApps: await Application.countDocuments(), totalUsers: await User.countDocuments() } });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- Socket Management ---
io.on('connection', (socket) => {
    socket.on('user_login', (data) => {
        socket.broadcast.emit('server_broadcast', `Live Node Active: ${data.name} (${data.role})`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Cyber-Core Online at http://localhost:${PORT}`));