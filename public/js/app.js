const socket = io();

// Sample jobs for skill matching engine
const availableJobs = [
    { id: 1, title: 'Full-Stack Developer Intern', company: 'TechCorp', skillRequired: 'Web Development' },
    { id: 2, title: 'Data Analyst Associate', company: 'DataGlobe', skillRequired: 'Data Science' },
    { id: 3, title: 'Cloud Infrastructure Engineer', company: 'SkyNet Systems', skillRequired: 'DevOps' },
    { id: 4, title: 'UI/UX Frontend Developer', company: 'DesignHub', skillRequired: 'Web Development' }
];

async function login() {
    const token = document.getElementById('auth-token').value;
    const errBox = document.getElementById('error-msg');
    errBox.classList.add('hidden');

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await res.json();

        if (data.success) {
            if (data.role === 'admin') {
                window.location.href = '/admin.html';
            } else if (data.role === 'university') {
                window.location.href = '/university.html';
            } else {
                // Show Dashboard
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('dashboard-screen').classList.remove('hidden');
                document.getElementById('user-greeting').innerText = `Welcome, ${data.name}`;

                // 1. Render Registered Skills from MongoDB
                const userSkills = data.data?.needs || [];
                const skillsEl = document.getElementById('student-skills');
                if (skillsEl) {
                    if (userSkills.length > 0) {
                        skillsEl.innerHTML = userSkills.map(skill => 
                            `<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1 rounded-full font-semibold">${skill}</span>`
                        ).join('');
                    } else {
                        skillsEl.innerHTML = `<span class="text-xs text-gray-500 italic">No skills registered on profile.</span>`;
                    }
                }

                // 2. Filter & Render Matched Jobs
                const jobListEl = document.getElementById('job-list');
                if (jobListEl) {
                    const matchedJobs = availableJobs.filter(job => userSkills.includes(job.skillRequired));
                    if (matchedJobs.length > 0) {
                        jobListEl.innerHTML = matchedJobs.map(job => `
                            <div class="p-4 bg-black/50 rounded-lg border border-gray-800 flex justify-between items-center">
                                <div>
                                    <h4 class="font-semibold text-white text-sm">${job.title}</h4>
                                    <p class="text-xs text-gray-400">${job.company}</p>
                                </div>
                                <span class="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-medium">
                                    Matched: ${job.skillRequired}
                                </span>
                            </div>
                        `).join('');
                    } else {
                        jobListEl.innerHTML = `<p class="text-xs text-gray-500 italic">No matching job opportunities found for your current skills.</p>`;
                    }
                }

                // Notify socket server of active login session
                socket.emit('user_login', { name: data.name, role: data.role });
            }
        } else {
            errBox.innerText = data.message;
            errBox.classList.remove('hidden');
        }
    } catch (err) {
        errBox.innerText = 'Authentication failed. Please check connection.';
        errBox.classList.remove('hidden');
    }
}

// Real-time Socket.io Listeners
socket.on('server_broadcast', (msg) => {
    const alertBox = document.getElementById('broadcast-alert');
    if (alertBox) {
        alertBox.innerText = `📢 Broadcast: ${msg}`;
        alertBox.classList.remove('hidden');
    }
});