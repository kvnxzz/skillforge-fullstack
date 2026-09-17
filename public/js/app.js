const socket = io();

let currentUser = null;
let availableJobs = [];

// --- Fetch Jobs Dynamically from MongoDB ---
async function fetchJobs() {
    try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        if (data.success) {
            availableJobs = data.jobs.map(job => ({
                ...job,
                matchScore: job.matchScore || '⚡ 95% Match'
            }));
            if (currentUser) renderDashboard();
        }
    } catch (err) {
        console.error('Failed to fetch job collection:', err);
    }
}

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
                currentUser = data.data;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('dashboard-screen').classList.remove('hidden');
                document.getElementById('user-greeting').innerText = `Welcome, ${data.name}`;

                await fetchJobs(); // Load database jobs after successful login
                renderDashboard();
                socket.emit('user_login', { name: data.name, role: data.role });
            }
        } else {
            errBox.innerText = data.message;
            errBox.classList.remove('hidden');
        }
    } catch (err) {
        errBox.innerText = 'Authentication error. Please check server connection.';
        errBox.classList.remove('hidden');
    }
}

function renderDashboard() {
    if (!currentUser) return;
    
    const userSkills = currentUser.needs || [];
    const skillsEl = document.getElementById('student-skills');

    // Render Skill Badges
    if (skillsEl) {
        if (userSkills.length > 0) {
            skillsEl.innerHTML = userSkills.map(skill => `
                <span class="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-xl font-mono font-medium">
                    # ${skill}
                </span>
            `).join('');
        } else {
            skillsEl.innerHTML = `<span class="text-xs text-gray-500 italic">No skill vectors registered yet.</span>`;
        }
    }

    // Render Job Matches
    const jobListEl = document.getElementById('job-list');
    const matchedJobs = availableJobs.filter(job => userSkills.includes(job.skillRequired));

    document.getElementById('opportunity-count').innerText = matchedJobs.length;

    if (jobListEl) {
        if (matchedJobs.length > 0) {
            jobListEl.innerHTML = matchedJobs.map(job => `
                <div class="p-4 bg-black/60 rounded-xl border border-gray-800/80 hover:border-emerald-500/40 flex justify-between items-center transition-all">
                    <div>
                        <h4 class="font-bold text-white text-sm">${job.title}</h4>
                        <p class="text-xs text-gray-400 mt-0.5">${job.company} • Req: <span class="text-emerald-400">${job.skillRequired}</span></p>
                    </div>
                    <span class="text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                        ${job.matchScore}
                    </span>
                </div>
            `).join('');
        } else {
            jobListEl.innerHTML = `<p class="text-xs text-gray-500 italic p-4 text-center">No active matches found. Add skills like "Web Development" or "Data Science" above!</p>`;
        }
    }
}

// --- Persist Added Skill to MongoDB ---
async function addSkill() {
    const input = document.getElementById('new-skill-input');
    const newSkill = input.value.trim();
    
    if (newSkill && currentUser) {
        if (!currentUser.needs.includes(newSkill)) {
            const updatedNeeds = [...currentUser.needs, newSkill];

            try {
                const res = await fetch('/api/user/skills', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: currentUser.token, needs: updatedNeeds })
                });

                const data = await res.json();
                if (data.success) {
                    currentUser.needs = data.needs;
                    renderDashboard();
                }
            } catch (err) {
                console.error('Failed to persist updated skill:', err);
            }
        }
        input.value = '';
    }
}

// --- Real-time Socket Listeners ---
socket.on('server_broadcast', (msg) => {
    const alertBox = document.getElementById('broadcast-alert');
    if (alertBox) {
        alertBox.innerText = `📢 LIVE SYSTEM BROADCAST: ${msg}`;
        alertBox.classList.remove('hidden');
    }
});

// Live update when a university posts a new job
socket.on('new_job_posted', (newJob) => {
    availableJobs.unshift({
        ...newJob,
        matchScore: '🔥 New Listing'
    });
    if (currentUser) renderDashboard();
});