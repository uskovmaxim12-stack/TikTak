class TikTokClone {
    constructor() {
        this.apiUrl = 'http://localhost:3000/api';
        this.currentUser = null;
        this.currentPage = 1;
        this.isLoading = false;
        this.videos = [];
        
        this.init();
    }
    
    async init() {
        this.checkAuth();
        this.loadFeed();
        this.setupEventListeners();
        
        // Имитация уведомлений
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
    
    setupEventListeners() {
        // Загрузка при прокрутке
        const feed = document.getElementById('feed');
        feed.addEventListener('scroll', () => {
            if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 100) {
                this.loadMore();
            }
        });
        
        // Касания для мобильных
        let startY;
        feed.addEventListener('touchstart', e => {
            startY = e.touches[0].clientY;
        });
        
        feed.addEventListener('touchend', e => {
            const endY = e.changedTouches[0].clientY;
            if (Math.abs(startY - endY) > 50) {
                // Скроллинг видео
            }
        });
    }
    
    async checkAuth() {
        const token = localStorage.getItem('tiktok_token');
        if (token) {
            try {
                const response = await fetch(`${this.apiUrl}/verify`, {
                    headers: { 'Authorization': token }
                });
                if (response.ok) {
                    this.currentUser = JSON.parse(localStorage.getItem('tiktok_user'));
                    this.hideModal('loginModal');
                }
            } catch (err) {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }
    
    async login() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        const response = await fetch(`${this.apiUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (data.token) {
            localStorage.setItem('tiktok_token', data.token);
            localStorage.setItem('tiktok_user', JSON.stringify(data));
            this.currentUser = data;
            this.hideModal('loginModal');
            this.loadFeed();
        } else {
            alert('Ошибка входа');
        }
    }
    
    async register() {
        const username = document.getElementById('regUsername').value;
        const password = document.getElementById('regPassword').value;
        
        const response = await fetch(`${this.apiUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            alert('Регистрация успешна! Войдите.');
            this.showLogin();
        } else {
            alert('Ошибка регистрации');
        }
    }
    
    async loadFeed() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        try {
            const response = await fetch(
                `${this.apiUrl}/feed?page=${this.currentPage}&limit=5&userId=${this.currentUser?.userId || ''}`
            );
            const newVideos = await response.json();
            
            if (this.currentPage === 1) {
                this.videos = newVideos;
            } else {
                this.videos = [...this.videos, ...newVideos];
            }
            
            this.renderFeed();
            this.currentPage++;
        } catch (err) {
            console.error('Ошибка загрузки:', err);
        }
        
        this.isLoading = false;
    }
    
    renderFeed() {
        const feed = document.getElementById('feed');
        feed.innerHTML = '';
        
        this.videos.forEach(video => {
            const videoEl = document.createElement('div');
            videoEl.className = 'video-container';
            videoEl.innerHTML = `
                <video class="video-player" autoplay muted loop playsinline
                    poster="${this.apiUrl}${video.thumbUrl}">
                    <source src="${this.apiUrl}${video.videoUrl}" type="video/mp4">
                </video>
                <div class="video-overlay">
                    <div class="video-info">
                        <div class="username">@${video.username}</div>
                        <div class="caption">${video.caption}</div>
                        <div class="hashtags">${video.hashtags.map(tag => `#${tag}`).join(' ')}</div>
                    </div>
                </div>
                <div class="video-actions">
                    <button class="action-btn" onclick="app.likeVideo('${video._id}')">
                        <i class="fas fa-heart ${video.likes?.includes(app.currentUser?.userId) ? 'liked' : ''}"></i>
                        <div class="action-count">${video.likes?.length || 0}</div>
                    </button>
                    <button class="action-btn" onclick="app.showComments('${video._id}')">
                        <i class="fas fa-comment"></i>
                        <div class="action-count">${video.comments?.length || 0}</div>
                    </button>
                    <button class="action-btn" onclick="app.shareVideo('${video._id}')">
                        <i class="fas fa-share"></i>
                    </button>
                </div>
            `;
            
            // Автовоспроизведение при попадании в viewport
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target.querySelector('video');
                    if (entry.isIntersecting) {
                        video.play();
                    } else {
                        video.pause();
                    }
                });
            }, { threshold: 0.5 });
            
            observer.observe(videoEl);
            feed.appendChild(videoEl);
        });
    }
    
    async likeVideo(videoId) {
        if (!this.currentUser) return this.showLogin();
        
        await fetch(`${this.apiUrl}/like/${videoId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('tiktok_token')
            },
            body: JSON.stringify({ userId: this.currentUser.userId })
        });
        
        this.loadFeed();
    }
    
    async uploadVideo() {
        const fileInput = document.getElementById('videoFile');
        const caption = document.getElementById('videoCaption').value;
        const hashtags = document.getElementById('videoHashtags').value;
        
        if (!fileInput.files[0]) {
            alert('Выберите видео');
            return;
        }
        
        const formData = new FormData();
        formData.append('video', fileInput.files[0]);
        formData.append('caption', caption);
        formData.append('hashtags', hashtags);
        formData.append('userId', this.currentUser.userId);
        formData.append('username', this.currentUser.username);
        
        try {
            const response = await fetch(`${this.apiUrl}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': localStorage.getItem('tiktok_token')
                },
                body: formData
            });
            
            if (response.ok) {
                alert('Видео загружено!');
                this.hideModal('uploadModal');
                this.loadFeed();
            }
        } catch (err) {
            console.error('Ошибка загрузки:', err);
        }
    }
    
    showModal(id) {
        document.getElementById(id).style.display = 'flex';
    }
    
    hideModal(id) {
        document.getElementById(id).style.display = 'none';
    }
    
    showLogin() {
        this.showModal('loginModal');
    }
    
    showUpload() {
        if (!this.currentUser) return this.showLogin();
        this.showModal('uploadModal');
    }
    
    // PWA функциональность
    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('Service Worker зарегистрирован'));
        }
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.installPrompt = e;
            // Показать кнопку установки
        });
    }
    
    // Офлайн режим
    setupOffline() {
        if (!navigator.onLine) {
            // Показать офлайн кэш
        }
        
        window.addEventListener('online', () => this.loadFeed());
        window.addEventListener('offline', () => {
            alert('Режим офлайн. Данные могут быть устаревшими.');
        });
    }
}

// Инициализация
const app = new TikTokClone();

// Глобальные функции для HTML событий
window.login = () => app.login();
window.register = () => app.register();
window.uploadVideo = () => app.uploadVideo();
window.showUpload = () => app.showUpload();
window.showLogin = () => app.showLogin();
window.showRegister = () => {
    document.getElementById('loginModal').innerHTML += `
        <div class="modal-content">
            <h2>Регистрация</h2>
            <input type="text" id="regUsername" placeholder="Имя пользователя">
            <input type="password" id="regPassword" placeholder="Пароль">
            <button onclick="register()">Зарегистрироваться</button>
            <button onclick="showLogin()">Назад к входу</button>
        </div>
    `;
};

// Адаптация к устройству
if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.body.classList.add('mobile');
    
    // Предотвращение масштабирования
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => {
        if (e.scale !== 1) e.preventDefault();
    }, { passive: false });
}

// Запуск при полной загрузке
window.addEventListener('load', () => {
    app.setupPWA();
    app.setupOffline();
});
