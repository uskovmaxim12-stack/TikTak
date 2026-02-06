// ==================== TIKTOK ПОЛНЫЙ СЕРВЕР ====================
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ==================== ХРАНЕНИЕ ДАННЫХ В ПАМЯТИ ====================
const db = {
    users: new Map(),
    videos: new Map(),
    comments: new Map(),
    messages: new Map(),
    notifications: new Map(),
    follows: new Map(),
    likes: new Map()
};

// ==================== РЕГИСТРАЦИЯ И ВХОД ====================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        console.log('Регистрация:', { username, email });
        
        // Проверяем существование пользователя
        for (let user of db.users.values()) {
            if (user.username === username) {
                return res.json({ success: false, error: 'Пользователь уже существует' });
            }
            if (user.email === email) {
                return res.json({ success: false, error: 'Email уже используется' });
            }
        }
        
        // Создаем пользователя
        const userId = crypto.randomBytes(16).toString('hex');
        const user = {
            id: userId,
            username,
            email,
            password: crypto.createHash('sha256').update(password).digest('hex'),
            profilePic: `https://ui-avatars.com/api/?name=${username}&background=FF0050&color=fff`,
            bio: '',
            followers: [],
            following: [],
            videos: [],
            likedVideos: [],
            savedVideos: [],
            createdAt: Date.now(),
            isVerified: false,
            private: false
        };
        
        db.users.set(userId, user);
        db.follows.set(userId, []);
        
        console.log('Пользователь создан:', user.id);
        
        // Создаем токен
        const token = crypto.createHash('sha256').update(userId + Date.now()).digest('hex');
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                profilePic: user.profilePic,
                followers: user.followers.length,
                following: user.following.length
            }
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Вход:', username);
        
        // Ищем пользователя
        let user = null;
        for (let u of db.users.values()) {
            if (u.username === username || u.email === username) {
                user = u;
                break;
            }
        }
        
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        // Проверяем пароль
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        if (user.password !== hashedPassword) {
            return res.json({ success: false, error: 'Неверный пароль' });
        }
        
        // Создаем токен
        const token = crypto.createHash('sha256').update(user.id + Date.now()).digest('hex');
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                profilePic: user.profilePic,
                followers: user.followers.length,
                following: user.following.length,
                bio: user.bio,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ПРОВЕРКА ТОКЕНА ====================
app.post('/api/verify', (req, res) => {
    const { token } = req.body;
    
    // В реальном приложении проверяли бы токен
    // Здесь просто возвращаем успех если токен есть
    if (token && token.length > 10) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// ==================== ПРОФИЛЬ ====================
app.get('/api/profile/:username', (req, res) => {
    try {
        const username = req.params.username;
        
        // Ищем пользователя
        let user = null;
        for (let u of db.users.values()) {
            if (u.username === username) {
                user = u;
                break;
            }
        }
        
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        // Получаем видео пользователя
        const userVideos = [];
        for (let video of db.videos.values()) {
            if (video.userId === user.id) {
                userVideos.push(video);
            }
        }
        
        // Получаем лайкнутые видео
        const likedVideos = [];
        for (let video of db.videos.values()) {
            if (video.likes.includes(user.id)) {
                likedVideos.push(video);
            }
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                profilePic: user.profilePic,
                bio: user.bio,
                followers: user.followers.length,
                following: user.following.length,
                videosCount: userVideos.length,
                likesCount: likedVideos.length,
                isVerified: user.isVerified,
                private: user.private,
                createdAt: user.createdAt
            },
            videos: userVideos,
            likedVideos: likedVideos
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/profile', (req, res) => {
    try {
        const { userId, bio, profilePic } = req.body;
        
        const user = db.users.get(userId);
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        if (bio !== undefined) user.bio = bio;
        if (profilePic !== undefined) user.profilePic = profilePic;
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                profilePic: user.profilePic,
                bio: user.bio
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ПОДПИСКИ ====================
app.post('/api/follow/:userId', (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const { followerId } = req.body;
        
        const targetUser = db.users.get(targetUserId);
        const follower = db.users.get(followerId);
        
        if (!targetUser || !follower) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        const isFollowing = targetUser.followers.includes(followerId);
        
        if (isFollowing) {
            // Отписаться
            targetUser.followers = targetUser.followers.filter(id => id !== followerId);
            follower.following = follower.following.filter(id => id !== targetUserId);
        } else {
            // Подписаться
            targetUser.followers.push(followerId);
            follower.following.push(targetUserId);
            
            // Создаем уведомление
            if (!db.notifications.has(targetUserId)) {
                db.notifications.set(targetUserId, []);
            }
            
            db.notifications.get(targetUserId).push({
                id: crypto.randomBytes(8).toString('hex'),
                type: 'follow',
                userId: followerId,
                username: follower.username,
                createdAt: Date.now(),
                seen: false
            });
        }
        
        res.json({
            success: true,
            isFollowing: !isFollowing,
            followersCount: targetUser.followers.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ВИДЕО ====================
// Загрузка видео
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.random().toString(36).substring(7) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

app.post('/api/videos/upload', upload.single('video'), (req, res) => {
    try {
        const { userId, username, caption, hashtags } = req.body;
        
        if (!req.file) {
            return res.json({ success: false, error: 'Видео не загружено' });
        }
        
        const user = db.users.get(userId);
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        const videoId = crypto.randomBytes(16).toString('hex');
        
        const video = {
            id: videoId,
            userId,
            username,
            videoUrl: `/uploads/${req.file.filename}`,
            thumbnail: `https://img.youtube.com/vi/${crypto.randomBytes(10).toString('hex')}/hqdefault.jpg`,
            caption: caption || 'Новое видео',
            hashtags: hashtags ? hashtags.split(',').map(tag => tag.trim().toLowerCase()) : [],
            sound: 'Оригинальный звук',
            likes: [],
            comments: [],
            shares: 0,
            views: 0,
            duration: 60,
            createdAt: Date.now(),
            allowsDuet: true,
            allowsComment: true
        };
        
        db.videos.set(videoId, video);
        user.videos.push(videoId);
        
        // Обновляем хештеги
        video.hashtags.forEach(tag => {
            if (!db.hashtags) db.hashtags = new Map();
            if (!db.hashtags.has(tag)) db.hashtags.set(tag, []);
            db.hashtags.get(tag).push(videoId);
        });
        
        res.json({
            success: true,
            video: {
                id: video.id,
                username: video.username,
                videoUrl: video.videoUrl,
                thumbnail: video.thumbnail,
                caption: video.caption,
                likes: video.likes.length,
                comments: video.comments.length,
                shares: video.shares,
                views: video.views,
                createdAt: video.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Лента видео
app.get('/api/videos/feed', (req, res) => {
    try {
        const { userId, page = 1, limit = 10 } = req.query;
        
        const user = db.users.get(userId);
        const followingIds = user ? user.following : [];
        
        const allVideos = Array.from(db.videos.values());
        
        // Алгоритм рекомендаций
        const recommendedVideos = allVideos
            .sort((a, b) => {
                // Вес видео
                const aWeight = calculateVideoWeight(a, followingIds);
                const bWeight = calculateVideoWeight(b, followingIds);
                return bWeight - aWeight;
            })
            .slice((page - 1) * limit, page * limit);
        
        res.json({
            success: true,
            videos: recommendedVideos
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function calculateVideoWeight(video, followingIds) {
    const ageInHours = (Date.now() - video.createdAt) / (1000 * 60 * 60);
    const engagement = video.likes.length * 2 + video.comments.length * 3 + video.shares * 4;
    const isFollowing = followingIds.includes(video.userId) ? 1000 : 0;
    return (engagement + isFollowing) / (ageInHours + 1);
}

// Популярные видео
app.get('/api/videos/trending', (req, res) => {
    try {
        const videos = Array.from(db.videos.values())
            .sort((a, b) => {
                const aPopularity = a.likes.length * 2 + a.comments.length * 3 + a.shares * 4;
                const bPopularity = b.likes.length * 2 + b.comments.length * 3 + b.shares * 4;
                return bPopularity - aPopularity;
            })
            .slice(0, 50);
        
        res.json({
            success: true,
            videos
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Поиск видео
app.get('/api/videos/search', (req, res) => {
    try {
        const query = req.query.q.toLowerCase();
        
        if (!query) {
            return res.json({ success: true, videos: [] });
        }
        
        const videos = Array.from(db.videos.values())
            .filter(video => 
                video.caption.toLowerCase().includes(query) ||
                video.hashtags.some(tag => tag.includes(query)) ||
                video.username.toLowerCase().includes(query)
            )
            .slice(0, 20);
        
        res.json({
            success: true,
            videos
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ЛАЙКИ ====================
app.post('/api/videos/:videoId/like', (req, res) => {
    try {
        const videoId = req.params.videoId;
        const { userId } = req.body;
        
        const video = db.videos.get(videoId);
        const user = db.users.get(userId);
        
        if (!video || !user) {
            return res.json({ success: false, error: 'Не найдено' });
        }
        
        const hasLiked = video.likes.includes(userId);
        
        if (hasLiked) {
            // Убрать лайк
            video.likes = video.likes.filter(id => id !== userId);
            user.likedVideos = user.likedVideos.filter(id => id !== videoId);
        } else {
            // Поставить лайк
            video.likes.push(userId);
            user.likedVideos.push(videoId);
            
            // Создаем уведомление (если не свой лайк)
            if (video.userId !== userId) {
                if (!db.notifications.has(video.userId)) {
                    db.notifications.set(video.userId, []);
                }
                
                db.notifications.get(video.userId).push({
                    id: crypto.randomBytes(8).toString('hex'),
                    type: 'like',
                    userId,
                    username: user.username,
                    videoId,
                    createdAt: Date.now(),
                    seen: false
                });
            }
        }
        
        res.json({
            success: true,
            likes: video.likes.length,
            hasLiked: !hasLiked
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== КОММЕНТАРИИ ====================
app.post('/api/videos/:videoId/comments', (req, res) => {
    try {
        const videoId = req.params.videoId;
        const { userId, text } = req.body;
        
        const video = db.videos.get(videoId);
        const user = db.users.get(userId);
        
        if (!video || !user) {
            return res.json({ success: false, error: 'Не найдено' });
        }
        
        if (!video.allowsComment) {
            return res.json({ success: false, error: 'Комментарии отключены' });
        }
        
        const commentId = crypto.randomBytes(8).toString('hex');
        const comment = {
            id: commentId,
            userId,
            username: user.username,
            text,
            likes: 0,
            replies: [],
            createdAt: Date.now()
        };
        
        if (!db.comments.has(videoId)) {
            db.comments.set(videoId, []);
        }
        
        db.comments.get(videoId).push(comment);
        
        // Создаем уведомление (если не свой комментарий)
        if (video.userId !== userId) {
            if (!db.notifications.has(video.userId)) {
                db.notifications.set(video.userId, []);
            }
            
            db.notifications.get(video.userId).push({
                id: crypto.randomBytes(8).toString('hex'),
                type: 'comment',
                userId,
                username: user.username,
                videoId,
                text: text.substring(0, 50),
                createdAt: Date.now(),
                seen: false
            });
        }
        
        res.json({
            success: true,
            comment
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/videos/:videoId/comments', (req, res) => {
    try {
        const videoId = req.params.videoId;
        const comments = db.comments.get(videoId) || [];
        
        res.json({
            success: true,
            comments
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/comments/:commentId/like', (req, res) => {
    try {
        const commentId = req.params.commentId;
        
        // Находим комментарий
        let foundComment = null;
        let videoId = null;
        
        for (let [vid, comments] of db.comments) {
            const comment = comments.find(c => c.id === commentId);
            if (comment) {
                foundComment = comment;
                videoId = vid;
                break;
            }
        }
        
        if (!foundComment) {
            return res.json({ success: false, error: 'Комментарий не найден' });
        }
        
        foundComment.likes += 1;
        
        res.json({
            success: true,
            likes: foundComment.likes
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== УВЕДОМЛЕНИЯ ====================
app.get('/api/notifications/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const notifications = db.notifications.get(userId) || [];
        
        const sortedNotifications = notifications
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 50);
        
        res.json({
            success: true,
            notifications: sortedNotifications
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== СТАТИЧЕСКИЕ ФАЙЛЫ ====================
app.use('/uploads', express.static('uploads'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== ЗАГРУЗКА ДЕМО ДАННЫХ ====================
function loadDemoData() {
    console.log('Загрузка демо данных...');
    
    // Создаем демо пользователей
    for (let i = 1; i <= 100; i++) {
        const userId = `user_${i}`;
        const user = {
            id: userId,
            username: `user${i}`,
            email: `user${i}@demo.com`,
            password: crypto.createHash('sha256').update('password123').digest('hex'),
            profilePic: `https://i.pravatar.cc/150?img=${i}`,
            bio: `Демо пользователь #${i}`,
            followers: [],
            following: [],
            videos: [],
            likedVideos: [],
            savedVideos: [],
            createdAt: Date.now() - Math.random() * 10000000000,
            isVerified: i % 10 === 0,
            private: i % 20 === 0
        };
        
        db.users.set(userId, user);
        db.follows.set(userId, []);
    }
    
    // Создаем демо видео (1000 видео)
    const videoSources = [
        'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
        '9bZkp7q19f0', // PSY - GANGNAM STYLE
        'kJQP7kiw5Fk', // Luis Fonsi - Despacito
        'CduA0TULnow', // Shakira - Waka Waka
        'JGwWNGJdvx8', // Ed Sheeran - Shape of You
        '7wtfhZwyrcc', // Imagine Dragons - Believer
        'OPf0YbXqDm0', // Mark Ronson - Uptown Funk
        'RgKAFK5djSk', // Wiz Khalifa - See You Again
        'oyEuk8j8imI', // Taylor Swift - Love Story
        'QcIy9NiNbmo'  // Katy Perry - Roar
    ];
    
    for (let i = 1; i <= 1000; i++) {
        const userId = `user_${Math.ceil(Math.random() * 100)}`;
        const user = db.users.get(userId);
        const videoSource = videoSources[Math.floor(Math.random() * videoSources.length)];
        
        const videoId = `video_${i}`;
        const video = {
            id: videoId,
            userId: user.id,
            username: user.username,
            videoUrl: `https://www.youtube.com/embed/${videoSource}?autoplay=1`,
            thumbnail: `https://img.youtube.com/vi/${videoSource}/hqdefault.jpg`,
            caption: `Трендовое видео #${i} - ${['танцы', 'музыка', 'комедия', 'спорт', 'путешествия', 'еда', 'животные', 'мода'][Math.floor(Math.random() * 8)]}`,
            hashtags: ['тренд', 'вирус', 'развлечения'],
            sound: ['Оригинальный звук', 'Трендовый звук', 'Популярная музыка'][Math.floor(Math.random() * 3)],
            likes: Array.from({ length: Math.floor(Math.random() * 10000) }, (_, idx) => 
                `user_${Math.ceil(Math.random() * 100)}`
            ),
            comments: [],
            shares: Math.floor(Math.random() * 1000),
            views: Math.floor(Math.random() * 1000000),
            duration: 60 + Math.floor(Math.random() * 180),
            createdAt: Date.now() - Math.floor(Math.random() * 10000000000),
            allowsDuet: true,
            allowsComment: true
        };
        
        db.videos.set(videoId, video);
        user.videos.push(videoId);
        
        // Добавляем комментарии
        const commentCount = Math.floor(Math.random() * 100);
        const comments = [];
        for (let j = 0; j < commentCount; j++) {
            const commentUserId = `user_${Math.ceil(Math.random() * 100)}`;
            const commentUser = db.users.get(commentUserId);
            
            comments.push({
                id: `comment_${i}_${j}`,
                userId: commentUserId,
                username: commentUser.username,
                text: `Отличное видео! #${j}`,
                likes: Math.floor(Math.random() * 100),
                replies: [],
                createdAt: Date.now() - Math.floor(Math.random() * 10000000)
            });
        }
        
        db.comments.set(videoId, comments);
    }
    
    // Создаем подписки
    for (let user of db.users.values()) {
        const followingCount = Math.floor(Math.random() * 50);
        for (let i = 0; i < followingCount; i++) {
            const randomUserId = `user_${Math.ceil(Math.random() * 100)}`;
            if (randomUserId !== user.id && !user.following.includes(randomUserId)) {
                user.following.push(randomUserId);
                const randomUser = db.users.get(randomUserId);
                randomUser.followers.push(user.id);
            }
        }
    }
    
    console.log('✅ Демо данные загружены: 100 пользователей, 1000 видео');
}

// ==================== ЗАПУСК СЕРВЕРА ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 TikTok сервер запущен на порту ${PORT}`);
    console.log(`📱 Откройте: http://localhost:${PORT}`);
    console.log(`🔧 API доступен по: http://localhost:${PORT}/api`);
    
    // Загружаем демо данные
    loadDemoData();
});

module.exports = app;
