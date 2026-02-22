const { WebcastPushConnection } = require('tiktok-live-connector');

let tiktokLiveConnection = null;
let currentUsername = null;

function getStatus() {
    return {
        connected: tiktokLiveConnection !== null,
        username: currentUsername
    };
}

function disconnect() {
    if (tiktokLiveConnection) {
        tiktokLiveConnection.disconnect();
        tiktokLiveConnection = null;
        currentUsername = null;
        console.log('[TikTok] Disconnected manually as requested');
    }
}

async function connect(username, io) {
    disconnect(); // Ensure previous is closed

    tiktokLiveConnection = new WebcastPushConnection(username);

    return new Promise((resolve, reject) => {
        tiktokLiveConnection.connect().then(state => {
            console.info(`[TikTok] Connected to roomId ${state.roomId}`);
            currentUsername = username;

            setupEvents(io);
            resolve(state);

        }).catch(err => {
            console.error('[TikTok] Failed to connect', err);
            tiktokLiveConnection = null;
            reject(err);
        });
    });
}

function setupEvents(io) {
    if (!tiktokLiveConnection) return;

    // Chat messages
    tiktokLiveConnection.on('chat', data => {
        io.emit('tiktok:chat', {
            uniqueId: data.uniqueId,
            nickname: data.nickname,
            comment: data.comment,
            profilePictureUrl: data.profilePictureUrl
        });
    });

    // Gifts
    tiktokLiveConnection.on('gift', data => {
        if (data.giftType === 1 && !data.repeatEnd) {
            // Streak in progress => show only temporary overlay
        } else {
            // Streak ended or non-streak gift => trigger action
            io.emit('tiktok:gift', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                giftName: data.giftName,
                diamondCount: data.diamondCount,
                repeatCount: data.repeatCount,
                profilePictureUrl: data.profilePictureUrl
            });
        }
    });

    // Likes
    tiktokLiveConnection.on('like', data => {
        io.emit('tiktok:like', {
            uniqueId: data.uniqueId,
            nickname: data.nickname,
            likeCount: data.likeCount
        });
    });

    // Follows
    tiktokLiveConnection.on('follow', data => {
        io.emit('tiktok:follow', {
            uniqueId: data.uniqueId,
            nickname: data.nickname
        });
    });

    tiktokLiveConnection.on('disconnected', () => {
        console.log('[TikTok] Disconnected naturally');
        currentUsername = null;
        tiktokLiveConnection = null;
        io.emit('tiktok:disconnected');
    });
}

module.exports = {
    connect,
    disconnect,
    getStatus
};
