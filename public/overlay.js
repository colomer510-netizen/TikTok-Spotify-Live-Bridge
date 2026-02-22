document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // DOM Elements
    const alertContainer = document.getElementById('alert-container');
    const sfxGift = document.getElementById('sfx-gift');
    const sfxFollow = document.getElementById('sfx-follow');

    // Goal Elements
    const goalText = document.getElementById('goal-text');
    const goalBar = document.getElementById('goal-bar');
    let currentLikes = 0;
    const targetLikes = 10000; // Hardcoded goal for demonstration. Can be dynamic later.

    // Initialize Goal Bar
    updateGoalUI();

    // ---- TikTok Events ----
    socket.on('tiktok:gift', (data) => {
        const title = `Nuevo Regalo!`;
        const message = `${data.nickname} envió ${data.giftName} x${data.repeatCount}`;
        const icon = '<i class="fa-solid fa-gift"></i>';

        triggerAlert(title, message, icon);

        // Play SFX
        if (sfxGift) {
            sfxGift.currentTime = 0;
            sfxGift.play().catch(e => console.error("Audio play failed:", e));
        }
    });

    socket.on('tiktok:follow', (data) => {
        const title = `Nuevo Seguidor!`;
        const message = `¡Gracias por seguir, ${data.nickname}!`;
        const icon = '<i class="fa-solid fa-user-plus"></i>';

        triggerAlert(title, message, icon);

        // Play SFX
        if (sfxFollow) {
            sfxFollow.currentTime = 0;
            sfxFollow.play().catch(e => console.error("Audio play failed:", e));
        }
    });

    socket.on('tiktok:like', (data) => {
        // Update the Likes Goal bar
        currentLikes += data.likeCount;
        updateGoalUI();
    });

    // ---- Helper Functions ----
    function triggerAlert(title, message, iconHTML) {
        // Create alert box
        const box = document.createElement('div');
        box.className = 'alert-box';

        box.innerHTML = `
            <div class="alert-icon">${iconHTML}</div>
            <div class="alert-content">
                <h2>${title}</h2>
                <p>${message}</p>
            </div>
        `;

        alertContainer.appendChild(box);

        // Force reflow for transition
        void box.offsetWidth;

        // Show
        box.classList.add('show');

        // Remove after 5 seconds
        setTimeout(() => {
            box.classList.remove('show');
            setTimeout(() => {
                if (box.parentNode) box.parentNode.removeChild(box);
            }, 500); // Wait for transition fade out
        }, 5000);
    }

    function updateGoalUI() {
        if (currentLikes > targetLikes) currentLikes = targetLikes;

        goalText.textContent = `${currentLikes} / ${targetLikes}`;
        const percentage = (currentLikes / targetLikes) * 100;
        goalBar.style.width = `${percentage}%`;
    }
});
