const axios = require('axios');
const querystring = require('querystring');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

let accessToken = null;
let refreshToken = null;
let tokenExpirationTime = null;

function getAuthUrl() {
    const scope = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';
    return 'https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: SPOTIFY_CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
        });
}

async function handleCallback(code) {
    const authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        method: 'post',
        data: querystring.stringify({
            code: code,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        }),
        headers: {
            'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    try {
        const response = await axios(authOptions);
        accessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;
        // Calculate expiration time (current time + expires_in seconds)
        tokenExpirationTime = Date.now() + (response.data.expires_in * 1000);
        console.log('[Spotify] Successfully authenticated!');
        return true;
    } catch (error) {
        console.error('[Spotify] Auth Error:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function refreshAccessToken() {
    if (!refreshToken) return false;

    const authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        method: 'post',
        data: querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }),
        headers: {
            'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    try {
        const response = await axios(authOptions);
        accessToken = response.data.access_token;
        if (response.data.refresh_token) {
            refreshToken = response.data.refresh_token;
        }
        tokenExpirationTime = Date.now() + (response.data.expires_in * 1000);
        console.log('[Spotify] Access token refreshed');
        return true;
    } catch (error) {
        console.error('[Spotify] Error refreshing token:', error.response ? error.response.data : error.message);
        return false;
    }
}

async function checkAndRefreshToken() {
    if (!accessToken) return false;
    // Refresh if within 5 minutes of expiring
    if (Date.now() > tokenExpirationTime - (5 * 60 * 1000)) {
        return await refreshAccessToken();
    }
    return true;
}

function isConnected() {
    return accessToken !== null;
}

// ---- Playback Controls ----

async function play() {
    if (!(await checkAndRefreshToken())) return;
    try {
        await axios.put('https://api.spotify.com/v1/me/player/play', {}, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log('[Spotify] Play triggered');
    } catch (err) {
        console.error('[Spotify] Play Error:', err.response ? err.response.data : err.message);
    }
}

async function pause() {
    if (!(await checkAndRefreshToken())) return;
    try {
        await axios.put('https://api.spotify.com/v1/me/player/pause', {}, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log('[Spotify] Pause triggered');
    } catch (err) {
        console.error('[Spotify] Pause Error:', err.response ? err.response.data : err.message);
    }
}

async function skip() {
    if (!(await checkAndRefreshToken())) return;
    try {
        await axios.post('https://api.spotify.com/v1/me/player/next', {}, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log('[Spotify] Skip triggered');
    } catch (err) {
        console.error('[Spotify] Skip Error:', err.response ? err.response.data : err.message);
    }
}

async function queueTrack(uri) {
    if (!(await checkAndRefreshToken())) return;
    try {
        await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {}, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log(`[Spotify] Queued track: ${uri}`);
    } catch (err) {
        console.error('[Spotify] Queue Error:', err.response ? err.response.data : err.message);
    }
}

async function searchTrack(query) {
    if (!(await checkAndRefreshToken())) return null;
    try {
        const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.data.tracks.items.length > 0) {
            return response.data.tracks.items[0]; // Return top result
        }
        return null;
    } catch (err) {
        console.error('[Spotify] Search Error:', err.response ? err.response.data : err.message);
        return null;
    }
}

async function getCurrentTrack() {
    if (!(await checkAndRefreshToken())) return null;
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.data && response.data.item) {
            return {
                name: response.data.item.name,
                artist: response.data.item.artists[0].name,
                is_playing: response.data.is_playing
            };
        }
        return null;
    } catch (err) {
        console.error('[Spotify] Current Track Error:', err.response ? err.response.data : err.message);
        return null;
    }
}

module.exports = {
    getAuthUrl,
    handleCallback,
    isConnected,
    play,
    pause,
    skip,
    queueTrack,
    searchTrack,
    getCurrentTrack
};
