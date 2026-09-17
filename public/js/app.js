const socket = io();

// Load initial settings
fetch('/api/settings')
    .then(res => res.json())
    .then(data => {
        document.getElementById('portal-title').innerText = data.portalName;
        document.getElementById('dash-title').innerText = data.portalName;
    });

async function login() {
    const token = document.getElementById('auth-token').value;
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    
    const data = await res.json();
    
    if (data.success) {
        if (data.role === 'admin') {
            window.location.href = '/admin.html'; // Redirect admins
        } else {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-screen').classList.remove('hidden');
            document.getElementById('user-greeting').innerText = `Welcome, ${data.name}`;
            
            // Register with websocket
            socket.emit('user_login', { name: data.name, role: data.role });
        }
    } else {
        document.getElementById('error-msg').innerText = data.message;
        document.getElementById('error-msg').classList.remove('hidden');
    }
}

// Real-time listeners
socket.on('server_broadcast', (msg) => {
    const alertBox = document.getElementById('broadcast-alert');
    alertBox.innerText = `[ADMIN BROADCAST]: ${msg}`;
    alertBox.classList.remove('hidden');
});

socket.on('settings_updated', (settings) => {
    document.getElementById('portal-title').innerText = settings.portalName;
    document.getElementById('dash-title').innerText = settings.portalName;
    if (settings.maintenanceMode) {
        alert("System is entering maintenance mode!");
    }
});