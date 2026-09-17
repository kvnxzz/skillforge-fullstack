require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS for Express and Socket.io
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, { 
    cors: { 
        origin: '*',
        methods: ['GET', 'POST']
    } 
});

// --- Static HTML Page Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/university.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'university.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- MongoDB Schemas & Models ---
const UserSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    name: String,
    role: String,
    needs: [String]
});
const User = mongoose.model('User', UserSchema);

const SettingsSchema = new mongoose.Schema({
    id: { type: String, default: 'global' },
    portalName: { type: String, default: 'SkillForge Live' },
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

// --- Skill Matching Algorithm ---
function calculateMatch(studentSkills, requiredSkillString) {
    if (!studentSkills || !studentSkills.length || !requiredSkillString) return 0;
    
    const studentSet = new Set(studentSkills.map(s => s.toLowerCase().trim()));
    const requiredSkills = requiredSkillString.split(',').map(s => s.toLowerCase().trim());
    
    let matches = 0;
    requiredSkills.forEach(skill => {
        if (studentSet.has(skill)) matches++;
    });
    
    return Math.round((matches / requiredSkills.length) * 100);
}

// --- Database Connection & Seeding ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/skillforge';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');

        try {
            const univExists = await User.findOne({ role: 'university' });
            if (!univExists) {
                await User.create({
                    token: 'UNIV2026',
                    name: 'State University',
                    role: 'university',
                    needs: []
                });
                console.log('🔹 Auto-seeded University token: UNIV2026');
            }

            const studentExists = await User.findOne({ role: 'student' });
            if (!studentExists) {
                await User.create({
                    token: 'STUDENT123',
                    name: 'Alex Student',
                    role: 'student',
                    needs: ['Web Development', 'Data Science']
                });
                console.log('🔹 Auto-seeded Student token: STUDENT123');
            }

            const jobCount = await Job.countDocuments();
            if (jobCount === 0) {
                await Job.insertMany([
                    { title: 'Full-Stack Developer Intern', company: 'TechCorp', skillRequired: 'Web Development' },
                    { title: 'Data Scientist Associate', company: 'DataGlobe', skillRequired: 'Data Science' },
                    { title: 'Cloud DevOps Architect', company: 'SkyNet Systems', skillRequired: 'DevOps' },
                    { title: 'UI/UX Interactive Designer', company: 'DesignHub', skillRequired: 'UI/UX' }
                ]);
                console.log('🔹 Auto-seeded initial job opportunities');
            }

            let settingsExists = await Settings.findOne({ id: 'global' });
            if (!settingsExists) {
                await Settings.create({ id: 'global', portalName: 'SkillForge Live', maintenanceMode: false });
                console.log('🔹 Auto-seeded Global Settings');
            }
        } catch (seedErr) {
            console.error('⚠️ Auto-seeding error:', seedErr);
        }
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- REST API Endpoints ---

// User Authentication
app.post('/api/auth', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }

        if (token === process.env.MASTER_ADMIN_TOKEN || token === 'ADMIN123') {
            return res.json({ success: true, role: 'admin', name: 'Master Admin' });
        }

        const user = await User.findOne({ token });
        if (user) {
            return res.json({ success: true, role: user.role, name: user.name, data: user });
        }

        res.status(401).json({ success: false, message: 'Invalid Token' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during authentication' });
    }
});

// Update Student Skills
app.put('/api/user/skills', async (req, res) => {
    try {
        const { token, needs } = req.body;
        const updatedUser = await User.findOneAndUpdate(
            { token },
            { needs },
            { new: true }
        );
        if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, needs: updatedUser.needs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to persist skill updates' });
    }
});

// Fetch All Jobs
app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
    }
});

// Post a New Job
app.post('/api/jobs', async (req, res) => {
    try {
        const { title, company, skillRequired } = req.body;
        if (!title || !company || !skillRequired) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const newJob = await Job.create({ title, company, skillRequired });
        io.emit('new_job_posted', newJob);
        res.json({ success: true, job: newJob });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create job' });
    }
});

// Delete a Job
app.delete('/api/jobs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedJob = await Job.findByIdAndDelete(id);

        if (!deletedJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        io.emit('job_deleted', id);
        res.json({ success: true, message: 'Job deleted successfully', id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete job' });
    }
});

// Submit Application
app.post('/api/applications', async (req, res) => {
    try {
        const { jobId, studentName, studentEmail, studentSkills } = req.body;
        
        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ success: false, message: 'Job posting not found' });

        const matchScore = calculateMatch(studentSkills, job.skillRequired);

        const application = await Application.create({
            jobId,
            studentName,
            studentEmail,
            skills: studentSkills,
            matchScore
        });

        io.emit('new_application', application);
        res.json({ success: true, application });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to submit application' });
    }
});

// Fetch Applications by Student Email
app.get('/api/applications/:email', async (req, res) => {
    try {
        const applications = await Application.find({ studentEmail: req.params.email })
            .populate('jobId')
            .sort({ appliedAt: -1 });
            
        res.json({ success: true, applications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch application records' });
    }
});

// Fetch All Applications (University/Admin Dashboard)
app.get('/api/university/applications', async (req, res) => {
    try {
        const applications = await Application.find()
            .populate('jobId')
            .sort({ appliedAt: -1 });
        res.json({ success: true, applications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch applications' });
    }
});

// Update Application Status
app.put('/api/applications/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await Application.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        if (!updated) return res.status(404).json({ success: false, message: 'Application not found' });
        
        io.emit('application_status_updated', updated);
        res.json({ success: true, application: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update application status' });
    }
});

// Admin Metrics Endpoint
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalJobs = await Job.countDocuments();
        const totalApps = await Application.countDocuments();
        const totalUsers = await User.countDocuments();
        
        res.json({ 
            success: true, 
            stats: { totalJobs, totalApps, totalUsers } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to compile admin metrics' });
    }
});

// Fetch Settings
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne({ id: 'global' });
        if (!settings) {
            settings = await Settings.create({ id: 'global', portalName: 'SkillForge Live', maintenanceMode: false });
        }
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
});

// Update Settings
app.put('/api/settings', async (req, res) => {
    try {
        const { portalName, maintenanceMode } = req.body;
        const updatedSettings = await Settings.findOneAndUpdate(
            { id: 'global' },
            { portalName, maintenanceMode },
            { new: true, upsert: true }
        );

        io.emit('settings_updated', updatedSettings);
        res.json({ success: true, settings: updatedSettings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update global settings' });
    }
});

// --- Real-time Socket.io Logic ---
const activeUsers = {};

io.on('connection', (socket) => {
    socket.on('user_login', (data) => {
        if (data && data.role !== 'admin') {
            activeUsers[socket.id] = { 
                name: data.name || 'Anonymous', 
                role: data.role, 
                loginTime: new Date() 
            };
            io.emit('admin_update_users', Object.values(activeUsers));
        }
    });

    socket.on('admin_broadcast', (message) => {
        io.emit('server_broadcast', message);
    });

    socket.on('admin_update_settings', async (newSettings) => {
        try {
            const updated = await Settings.findOneAndUpdate(
                { id: 'global' },
                { portalName: newSettings.portalName, maintenanceMode: newSettings.maintenanceMode },
                { new: true, upsert: true }
            );
            io.emit('settings_updated', updated);
        } catch (err) {
            console.error('Error updating settings via socket:', err);
        }
    });

    socket.on('disconnect', () => {
        if (activeUsers[socket.id]) {
            delete activeUsers[socket.id];
            io.emit('admin_update_users', Object.values(activeUsers));
        }
    });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({ success: false, message: 'An unexpected internal server error occurred.' });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));