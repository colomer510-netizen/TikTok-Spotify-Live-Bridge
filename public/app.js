document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    const spotifyBtn = document.getElementById('btn-spotify-login');
    const spotifyStatus = document.getElementById('spotify-status');
    const spotifyLed = document.getElementById('spotify-led');
    const currentTrackName = document.getElementById('current-track-name');

    const tiktokUsername = document.getElementById('tiktok-username');
    const btnTiktokConnect = document.getElementById('btn-tiktok-connect');
    const btnTiktokDisconnect = document.getElementById('btn-tiktok-disconnect');
    const tiktokStatus = document.getElementById('tiktok-status');
    const tiktokErrorMessage = document.getElementById('tiktok-error-message');
    const tiktokProfilePic = document.getElementById('tiktok-profile-pic');
    const tiktokUsernameDisplay = document.getElementById('tiktok-username-display');
    const tiktokLed = document.getElementById('tiktok-led');

    const eventsList = document.getElementById('events-list');

    // Config rules
    const ruleSpotifyPlay = document.getElementById('rule-spotify-play');
    const ruleLocalPlay = document.getElementById('rule-local-play');
    const ruleTtsChat = document.getElementById('rule-tts-chat'); // We will enable this later

    // ---- Initialization & Socket ----
    const socket = io();

    socket.on('connect', () => {
        logEvent('Connected to local bridge server.', 'system');
        checkConnections();
        loadLocalMusic();
    });

    // ---- Spotify Setup ----
    if (spotifyBtn) {
        spotifyBtn.addEventListener('click', () => {
            window.location.href = '/api/spotify/login';
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('spotify') === 'connected') {
        window.history.replaceState({}, document.title, "/");
    }

    // ---- TikTok Setup ----
    if (btnTiktokConnect) {
        btnTiktokConnect.addEventListener('click', async () => {
            const username = tiktokUsername.value.trim();
            if (!username) return;

            btnTiktokConnect.disabled = true;
            btnTiktokConnect.textContent = 'Connecting...';
            tiktokErrorMessage.classList.add('hidden');

            try {
                const res = await fetch('/api/tiktok/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
                const data = await res.json();

                if (res.ok) {
                    setTikTokConnectedState(username);
                    logEvent(`Successfully connected to TikTok Live: @${username}`, 'system');
                } else {
                    throw new Error(data.error || 'Connection failed');
                }
            } catch (error) {
                logEvent(`TikTok Connection Error: ${error.message}`, 'error');
                tiktokStatus.textContent = 'Connection Failed';
                tiktokStatus.className = 'status-badge error';
                tiktokLed.className = 'led disconnected';

                tiktokErrorMessage.textContent = `Error: ${error.message}`;
                tiktokErrorMessage.classList.remove('hidden');
            } finally {
                btnTiktokConnect.disabled = false;
                btnTiktokConnect.textContent = 'Connect';
            }
        });
    }

    if (btnTiktokDisconnect) {
        btnTiktokDisconnect.addEventListener('click', async () => {
            await fetch('/api/tiktok/disconnect', { method: 'POST' });
            setTikTokDisconnectedState();
        });
    }

    function setTikTokConnectedState(username) {
        tiktokStatus.textContent = 'Connected';
        tiktokStatus.className = 'status-badge success';
        tiktokLed.className = 'led connected';

        tiktokUsernameDisplay.textContent = `@${username}`;
        tiktokProfilePic.classList.remove('hidden');

        btnTiktokConnect.classList.add('hidden');
        tiktokUsername.classList.add('hidden');
        btnTiktokDisconnect.classList.remove('hidden');
        tiktokErrorMessage.classList.add('hidden');
    }

    function setTikTokDisconnectedState() {
        tiktokStatus.textContent = 'Disconnected';
        tiktokStatus.className = 'status-badge error';
        tiktokLed.className = 'led disconnected';

        tiktokUsernameDisplay.textContent = 'Not Connected';
        tiktokProfilePic.classList.add('hidden');

        btnTiktokConnect.classList.remove('hidden');
        tiktokUsername.classList.remove('hidden');
        btnTiktokDisconnect.classList.add('hidden');
    }

    // ---- Status Check ----
    async function checkConnections() {
        try {
            const spotRes = await fetch('/api/spotify/status').then(r => r.json());
            if (spotRes.connected) {
                spotifyStatus.textContent = 'Connected';
                spotifyStatus.className = 'status-badge success';
                spotifyLed.className = 'led connected';
                if (spotifyBtn) spotifyBtn.classList.add('hidden');
            } else {
                spotifyStatus.textContent = 'Not Authenticated';
                spotifyStatus.className = 'status-badge error';
                spotifyLed.className = 'led disconnected';
                if (spotifyBtn) spotifyBtn.classList.remove('hidden');
            }

            const ttRes = await fetch('/api/tiktok/status').then(r => r.json());
            if (ttRes.connected) {
                setTikTokConnectedState(ttRes.username);
            } else {
                setTikTokDisconnectedState();
            }
        } catch (e) {
            console.error("Status check failed", e);
        }
    }

    // Live update for current track
    setInterval(async () => {
        try {
            const spotRes = await fetch('/api/spotify/status').then(r => r.json());
            if (spotRes.connected) {
                const trackRes = await fetch('/api/spotify/current_track').then(r => r.json());
                if (trackRes.track) {
                    currentTrackName.textContent = `${trackRes.track} - ${trackRes.artist}`;
                } else {
                    currentTrackName.textContent = 'No track playing right now';
                }
            }
        } catch (err) { }
    }, 5000);

    // ---- Text-to-Speech (TTS) Helper ----
    function speakText(text) {
        if (!ruleTtsChat.checked || !window.speechSynthesis) return;

        // Prevent overlapping too much chat
        if (window.speechSynthesis.speaking) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES'; // Defaulting to Spanish given user locale
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
    }

    // ---- TikTok Events via WebSockets ----
    socket.on('tiktok:chat', (data) => {
        const msg = data.comment.trim();
        let isCommand = false;

        // Command Parsing
        if (msg.startsWith('!play ') && ruleSpotifyPlay.checked) {
            isCommand = true;
            const song = msg.substring(6).trim();
            if (song) {
                logEvent(`!play ${song}`, 'command', data);
                fetch('/api/spotify/search_and_queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: song })
                }).catch(console.error);
            }
        } else if (msg.startsWith('!playlocal ') && ruleLocalPlay.checked) {
            isCommand = true;
            const songName = msg.substring(11).trim().toLowerCase();
            if (songName) {
                logEvent(`!playlocal ${songName}`, 'command', data);
                playLocalMusic(songName);
            }
        } else if (msg === '!skip' && ruleSpotifyPlay.checked) {
            isCommand = true;
            logEvent(`!skip triggered`, 'command', data);
            socket.emit('spotify:skip');
        }

        if (!isCommand) {
            logEvent(msg, 'chat', data);
            speakText(`${data.nickname} dice: ${msg}`);
        }
    });

    socket.on('tiktok:gift', (data) => {
        const infoStr = `Sent ${data.giftName} x${data.repeatCount} (${data.diamondCount * data.repeatCount} Diamonds)!`;
        logEvent(infoStr, 'gift', data);
    });

    socket.on('tiktok:disconnected', () => {
        setTikTokDisconnectedState();
        logEvent('TikTok LIVE ended or connection lost.', 'system');
    });

    // ---- Helper: UI Logger ----
    function logEvent(text, type = 'chat', authorData = null) {
        if (!eventsList) return;

        const li = document.createElement('li');
        li.className = `feed-item ${type}`;

        if (authorData) {
            const avatar = authorData.profilePictureUrl || 'https://via.placeholder.com/28';
            li.innerHTML = `
                <img src="${avatar}" alt="user">
                <div>
                    <strong>${authorData.nickname}</strong> ${text}
                </div>
            `;
        } else {
            let icon = 'fa-info-circle';
            if (type === 'error') icon = 'fa-exclamation-triangle';
            if (type === 'command') icon = 'fa-terminal';

            li.innerHTML = `
                <i class="fa-solid ${icon}"></i>
                <div>${text}</div>
            `;
        }

        eventsList.appendChild(li);
        eventsList.parentElement.scrollTop = eventsList.parentElement.scrollHeight;
    }

    // ---- Local Music Functionality ----
    const localMusicSelect = document.getElementById('local-music-select');
    const btnLocalPlay = document.getElementById('btn-local-play');
    const localAudioPlayer = document.getElementById('local-audio-player');
    let localFiles = [];

    async function loadLocalMusic() {
        if (!localMusicSelect) return;
        try {
            const res = await fetch('/api/local-music');
            localFiles = await res.json();
            localMusicSelect.innerHTML = '';

            if (localFiles.length === 0) {
                const opt = document.createElement('option');
                opt.value = "";
                opt.textContent = "-- No Local Audio Found --";
                localMusicSelect.appendChild(opt);
                if (btnLocalPlay) btnLocalPlay.disabled = true;
                return;
            }

            localFiles.forEach(file => {
                const opt = document.createElement('option');
                opt.value = file;
                opt.textContent = file;
                localMusicSelect.appendChild(opt);
            });
            if (btnLocalPlay) btnLocalPlay.disabled = false;
        } catch (err) { }
    }

    function playLocalMusic(query) {
        const exactMatch = localFiles.find(f => f.toLowerCase() === query.toLowerCase() || f.toLowerCase() === query.toLowerCase() + '.mp3');
        const partialMatch = localFiles.find(f => f.toLowerCase().includes(query.toLowerCase()));
        const fileToPlay = exactMatch || partialMatch;

        if (fileToPlay && localAudioPlayer) {
            localAudioPlayer.src = `/music/${encodeURIComponent(fileToPlay)}`;
            localAudioPlayer.play().catch(e => console.error(e));
            logEvent(`Playing local music: ${fileToPlay}`, 'system');
        } else {
            logEvent(`Local file not found: ${query}`, 'system');
        }
    }

    if (btnLocalPlay) {
        btnLocalPlay.addEventListener('click', () => {
            const selected = localMusicSelect.value;
            if (selected) playLocalMusic(selected);
        });
    }
});
