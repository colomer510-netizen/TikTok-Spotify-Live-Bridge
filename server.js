require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import our helper modules
const tiktokHelper = require('./tiktok');
const spotifyHelper = require('./spotify');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/music', express.static(path.join(__dirname, 'local-music')));

// Spotify Routes
app.get('/api/spotify/login', (req, res) => {
    res.redirect(spotifyHelper.getAuthUrl());
});

app.post('/api/spotify/search_and_queue', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const track = await spotifyHelper.searchTrack(query);
    if (track) {
        await spotifyHelper.queueTrack(track.uri);
        res.json({ success: true, track: track.name, artist: track.artists[0].name });
    } else {
        res.status(404).json({ error: 'Track not found' });
    }
});

app.get('/api/spotify/callback', async (req, res) => {
    const code = req.query.code || null;
    try {
        await spotifyHelper.handleCallback(code);
        res.redirect('/?spotify=connected');
    } catch (error) {
        console.error('Spotify Auth Error:', error);
        res.redirect('/?spotify=error');
    }
});

app.get('/api/spotify/status', (req, res) => {
    res.json({ connected: spotifyHelper.isConnected() });
});

app.get('/api/spotify/current_track', async (req, res) => {
    if (!spotifyHelper.isConnected()) {
        return res.json({ error: 'Not connected' });
    }
    const track = await spotifyHelper.getCurrentTrack();
    if (track) {
        res.json({ track: track.name, artist: track.artist, is_playing: track.is_playing });
    } else {
        res.json({ track: null });
    }
});

// TikTok Routes
app.post('/api/tiktok/connect', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    tiktokHelper.connect(username, io)
        .then(() => res.json({ success: true, message: `Connected to ${username}` }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/tiktok/disconnect', (req, res) => {
    tiktokHelper.disconnect();
    res.json({ success: true });
});

app.get('/api/tiktok/status', (req, res) => {
    res.json(tiktokHelper.getStatus());
});

// Local Music Routes
app.get('/api/local-music', (req, res) => {
    const musicDir = path.join(__dirname, 'local-music');
    if (!fs.existsSync(musicDir)) {
        return res.json([]);
    }
    fs.readdir(musicDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read directory' });
        // Clean to only show common audio formats
        const audioFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'));
        res.json(audioFiles);
    });
});

// Real-time connections
io.on('connection', (socket) => {
    console.log('Frontend dashboard connected:', socket.id);

    // Listen for manual Spotify control events from dashboard
    socket.on('spotify:play', () => spotifyHelper.play());
    socket.on('spotify:pause', () => spotifyHelper.pause());
    socket.on('spotify:skip', () => spotifyHelper.skip());

    socket.on('disconnect', () => {
        console.log('Frontend dashboard disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});
