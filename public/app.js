document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    const spotifyBtn = document.getElementById('spotify-login-btn');
    const spotifyStatus = document.getElementById('spotify-status');
    const mediaControls = document.getElementById('media-controls');

    const tiktokStatus = document.getElementById('tiktok-status');
    const usernameInput = document.getElementById('username-input');
    const connectBtn = document.getElementById('connect-btn');

    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnSkip = document.getElementById('btn-skip');

    const eventFeed = document.getElementById('event-feed');

    // Config rules
    const rulePlayEnabled = document.getElementById('rule-play-enabled');
    const rulePlayLocalEnabled = document.getElementById('rule-playlocal-enabled');
    const ruleSkipEnabled = document.getElementById('rule-skip-enabled');
    const rulePauseEnabled = document.getElementById('rule-pause-enabled');

    // ---- Initialization & Socket ----
    const socket = io(); // Connects back to the same host

    socket.on('connect', () => {
        logEvent('Connected to local bridge server.', 'system');
        checkConnections();
        loadLocalMusic();
    });

    // ---- Spotify Setup ----
    spotifyBtn.addEventListener('click', () => {
        // Redirect to Backend OAuth route
        window.location.href = '/api/spotify/login';
    });

    // Check if we just returned from OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('spotify') === 'connected') {
        window.history.replaceState({}, document.title, "/"); // clean URL
    }

    // ---- TikTok Setup ----
    connectBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) return;

        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';

        try {
            const res = await fetch('/api/tiktok/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await res.json();

            if (res.ok) {
                tiktokStatus.textContent = `Connected: ${username}`;
                tiktokStatus.className = 'status online';
                logEvent(`Successfully connected to TikTok Live: @${username}`, 'system');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            logEvent(`Failed to connect: ${error.message}`, 'system');
            tiktokStatus.textContent = 'Connection Failed';
            tiktokStatus.className = 'status offline';
        } finally {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
        }
    });

    // ---- Status Check ----
    async function checkConnections() {
        // Check Spotify
        const spotRes = await fetch('/api/spotify/status').then(r => r.json());
        if (spotRes.connected) {
            spotifyStatus.textContent = 'Connected ✅';
            spotifyStatus.className = 'status online';
            spotifyBtn.style.display = 'none';
            mediaControls.classList.remove('hidden');
        }

        // Check TikTok
        const ttRes = await fetch('/api/tiktok/status').then(r => r.json());
        if (ttRes.connected) {
            tiktokStatus.textContent = `Connected: ${ttRes.username}`;
            tiktokStatus.className = 'status online';
        }
    }

    // Live update for current track
    setInterval(async () => {
        try {
            const spotRes = await fetch('/api/spotify/status').then(r => r.json());
            if (spotRes.connected) {
                const trackRes = await fetch('/api/spotify/current_track').then(r => r.json());
                const trackNameEl = document.getElementById('current-track-name');
                if (trackRes.track) {
                    trackNameEl.textContent = `${trackRes.track} - ${trackRes.artist}`;
                } else {
                    trackNameEl.textContent = 'No track playing right now';
                }
            }
        } catch (err) {
            console.error('Failed to update current track:', err);
        }
    }, 5000);

    // ---- Media Controls (Manual) ----
    btnPlay.addEventListener('click', () => socket.emit('spotify:play'));
    btnPause.addEventListener('click', () => socket.emit('spotify:pause'));
    btnSkip.addEventListener('click', () => socket.emit('spotify:skip'));

    // ---- TikTok Events via WebSockets ----

    socket.on('tiktok:chat', (data) => {
        const msg = data.comment.trim();

        // Command Parsing
        if (msg.startsWith('!play ') && rulePlayEnabled.checked) {
            const song = msg.substring(6).trim();
            if (song) {
                logEvent(`Command !play triggered by ${data.nickname}: ${song}`, 'command', data);
                // Call our server to search and play/queue
                fetch('/api/spotify/search_and_queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: song })
                }).catch(console.error);
            }
        } else if (msg.startsWith('!playlocal ') && rulePlayLocalEnabled.checked) {
            const songName = msg.substring(11).trim().toLowerCase();
            if (songName) {
                logEvent(`Command !playlocal triggered by ${data.nickname}: ${songName}`, 'command', data);
                playLocalMusic(songName);
            }
        } else if (msg === '!skip' && ruleSkipEnabled.checked) {
            logEvent(`Command !skip triggered by ${data.nickname}`, 'command', data);
            socket.emit('spotify:skip');
        } else if (msg === '!pause' && rulePauseEnabled.checked) {
            logEvent(`Command !pause triggered by ${data.nickname}`, 'command', data);
            socket.emit('spotify:pause');
        } else if (msg === '!resume' && rulePauseEnabled.checked) {
            logEvent(`Command !resume triggered by ${data.nickname}`, 'command', data);
            socket.emit('spotify:play');
        } else {
            // Normal Chat Logging
            logEvent(msg, 'chat', data);
        }
    });

    socket.on('tiktok:gift', (data) => {
        const infoStr = `${data.nickname} sent ${data.giftName} x${data.repeatCount} (${data.diamondCount * data.repeatCount} Diamonds)!`;
        logEvent(infoStr, 'gift', data);

        // Example Rule: A large gift skips the song regardless of checkboxes.
        if (data.diamondCount * data.repeatCount >= 100) {
            logEvent(`Huge gift triggered an auto-skip!`, 'system');
            socket.emit('spotify:skip');
        }
    });

    socket.on('tiktok:disconnected', () => {
        tiktokStatus.textContent = 'Offline';
        tiktokStatus.className = 'status offline';
        logEvent('TikTok LIVE ended or connection lost.', 'system');
    });

    // ---- Helper: UI Logger ----
    function logEvent(text, type = 'chat', authorData = null) {
        const wrap = document.createElement('div');
        wrap.className = `feed-message ${type}`;

        const timeString = new Date().toLocaleTimeString();

        if (authorData) {
            wrap.innerHTML = `
                <img src="${authorData.profilePictureUrl || 'https://via.placeholder.com/32'}" class="avatar" alt="Avatar">
                <div class="msg-content">
                    <span class="msg-author">${authorData.nickname}</span>
                    <div class="msg-text">${text}</div>
                </div>
                <span class="timestamp">${timeString}</span>
            `;
        } else {
            wrap.innerHTML = `
                <div class="msg-content">
                    <div class="msg-text">${text}</div>
                </div>
                <span class="timestamp">${timeString}</span>
            `;
        }

        eventFeed.appendChild(wrap);

        // Auto-scroll logic
        eventFeed.scrollTop = eventFeed.scrollHeight;
    }

    // ---- Local Music Functionality ----
    const localMusicSelect = document.getElementById('local-music-select');
    const btnLocalPlay = document.getElementById('btn-local-play');
    const localAudioPlayer = document.getElementById('local-audio-player');
    let localFiles = [];

    async function loadLocalMusic() {
        try {
            const res = await fetch('/api/local-music');
            localFiles = await res.json();

            localMusicSelect.innerHTML = '';

            if (localFiles.length === 0) {
                const opt = document.createElement('option');
                opt.value = "";
                opt.textContent = "-- No Local Audio Found --";
                localMusicSelect.appendChild(opt);
                btnLocalPlay.disabled = true;
                return;
            }

            localFiles.forEach(file => {
                const opt = document.createElement('option');
                opt.value = file;
                opt.textContent = file;
                localMusicSelect.appendChild(opt);
            });
            btnLocalPlay.disabled = false;

        } catch (err) {
            console.error("Failed to load local music", err);
        }
    }

    function playLocalMusic(query) {
        // Find best match in localFiles
        const exactMatch = localFiles.find(f => f.toLowerCase() === query.toLowerCase() || f.toLowerCase() === query.toLowerCase() + '.mp3');
        const partialMatch = localFiles.find(f => f.toLowerCase().includes(query.toLowerCase()));

        const fileToPlay = exactMatch || partialMatch;

        if (fileToPlay) {
            localAudioPlayer.src = `/music/${encodeURIComponent(fileToPlay)}`;
            localAudioPlayer.play().catch(err => console.error("Error playing audio:", err));
            logEvent(`Playing local music: ${fileToPlay}`, 'system');
        } else {
            logEvent(`Local file not found for query: ${query}`, 'system');
        }
    }

    // Manual play from UI
    btnLocalPlay.addEventListener('click', () => {
        const selected = localMusicSelect.value;
        if (selected) {
            playLocalMusic(selected);
        }
    });

});
