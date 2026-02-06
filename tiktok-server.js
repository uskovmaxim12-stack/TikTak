// ====================== СЕРВЕР TIKTOK ======================
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Создаем папки для хранения
const folders = ['uploads/videos', 'uploads/thumbs', 'tmp'];
folders.forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

// ====================== ХРАНЕНИЕ ДАННЫХ ======================
const db = {
    users: {},
    videos: {},
    comments: {},
    likes: {},
    follows: {}
};

// ====================== ЗАГРУЗКА ВИДЕО ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/videos');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Только видео файлы!'));
        }
    }
});

// ====================== API ======================

// 1. Получить ленту видео
app.get('/api/feed', (req, res) => {
    const videos = Object.values(db.videos)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);
    
    res.json(videos);
});

// 2. Загрузить видео
app.post('/api/upload', upload.single('video'), (req, res) => {
    try {
        const { username, caption } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Видео не загружено' });
        }
        
        const videoId = crypto.randomBytes(16).toString('hex');
        
        const video = {
            id: videoId,
            username: username || 'Пользователь',
            caption: caption || 'Новое видео',
            videoUrl: `/uploads/videos/${req.file.filename}`,
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            createdAt: Date.now(),
            hashtags: extractHashtags(caption),
            sound: 'Оригинальный звук'
        };
        
        db.videos[videoId] = video;
        
        // Создаем превью
        createVideoThumbnail(req.file.path, videoId);
        
        res.json({ success: true, video });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Лайкнуть видео
app.post('/api/video/:id/like', (req, res) => {
    const video = db.videos[req.params.id];
    
    if (!video) {
        return res.status(404).json({ error: 'Видео не найдено' });
    }
    
    video.likes += 1;
    res.json({ success: true, likes: video.likes });
});

// 4. Получить комментарии
app.get('/api/video/:id/comments', (req, res) => {
    const videoComments = db.comments[req.params.id] || [];
    res.json(videoComments);
});

// 5. Добавить комментарий
app.post('/api/video/:id/comment', (req, res) => {
    const { username, text } = req.body;
    const video = db.videos[req.params.id];
    
    if (!video) {
        return res.status(404).json({ error: 'Видео не найдено' });
    }
    
    if (!db.comments[req.params.id]) {
        db.comments[req.params.id] = [];
    }
    
    const comment = {
        id: crypto.randomBytes(8).toString('hex'),
        username,
        text,
        likes: 0,
        createdAt: Date.now()
    };
    
    db.comments[req.params.id].push(comment);
    video.comments += 1;
    
    res.json({ success: true, comment });
});

// 6. Лайкнуть комментарий
app.post('/api/comment/:id/like', (req, res) => {
    // Находим комментарий в базе
    for (const videoId in db.comments) {
        const comment = db.comments[videoId].find(c => c.id === req.params.id);
        if (comment) {
            comment.likes += 1;
            return res.json({ success: true, likes: comment.likes });
        }
    }
    
    res.status(404).json({ error: 'Комментарий не найден' });
});

// 7. Поделиться видео
app.post('/api/video/:id/share', (req, res) => {
    const video = db.videos[req.params.id];
    
    if (!video) {
        return res.status(404).json({ error: 'Видео не найдено' });
    }
    
    video.shares += 1;
    res.json({ success: true, shares: video.shares });
});

// 8. Поиск видео
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    
    if (!q) {
        return res.json([]);
    }
    
    const results = Object.values(db.videos)
        .filter(video => 
            video.caption.toLowerCase().includes(q.toLowerCase()) ||
            video.hashtags.some(tag => tag.includes(q.toLowerCase()))
        )
        .slice(0, 20);
    
    res.json(results);
});

// 9. Получить тренды
app.get('/api/trending', (req, res) => {
    const trending = Object.values(db.videos)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 20);
    
    res.json(trending);
});

// 10. Статистика видео
app.get('/api/video/:id/stats', (req, res) => {
    const video = db.videos[req.params.id];
    
    if (!video) {
        return res.status(404).json({ error: 'Видео не найдено' });
    }
    
    video.views += 1;
    
    res.json({
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        shares: video.shares
    });
});

// ====================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======================
function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#[\wа-яА-ЯёЁ]+/g) || [];
    return matches.map(tag => tag.substring(1).toLowerCase());
}

function createVideoThumbnail(videoPath, videoId) {
    // В реальном приложении здесь использовался бы FFmpeg
    // Сейчас просто создаем заглушку
    const thumbPath = path.join(__dirname, 'uploads', 'thumbs', `${videoId}.jpg`);
    
    // Создаем простое изображение-заглушку
    const svg = `
        <svg width="320" height="568" xmlns="http://www.w3.org/2000/svg">
            <rect width="320" height="568" fill="#121212"/>
            <rect x="20" y="20" width="280" height="528" rx="10" fill="#1a1a1a"/>
            <circle cx="160" cy="284" r="40" fill="#FF0050"/>
            <polygon points="150,270 150,300 180,285" fill="white"/>
            <text x="160" y="360" font-family="Arial" font-size="20" fill="white" text-anchor="middle">TikTok Video</text>
        </svg>
    `;
    
    // Сохраняем SVG как превью
    fs.writeFileSync(thumbPath.replace('.jpg', '.svg'), svg);
}

// ====================== СТАТИЧЕСКИЕ ФАЙЛЫ ======================
app.use('/uploads', express.static('uploads'));

// Отдаем HTML файл
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'tiktok-perfect.html'));
});

// ====================== ЗАГРУЗКА ДЕМО ДАННЫХ ======================
function loadDemoData() {
    // Демо видео
    const demoVideos = [
        {
            id: 'video1',
            username: 'танцующий_кот',
            caption: 'Этот танец взорвал интернет! #танец #тренд #веселье',
            likes: 1250000,
            comments: 23400,
            shares: 89000,
            views: 5000000,
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-dog-catching-a-ball-in-a-river-1494-large.mp4',
            sound: 'Оригинальный звук',
            hashtags: ['танец', 'тренд', 'веселье'],
            createdAt: Date.now() - 86400000
        }
        // Добавьте больше видео при необходимости
    ];
    
    demoVideos.forEach(video => {
        db.videos[video.id] = video;
    });
    
    // Демо комментарии
    db.comments['video1'] = [
        {
            id: 'c1',
            username: 'user123',
            text: 'Обожаю это видео! Танец просто огонь! 🔥',
            likes: 120,
            createdAt: Date.now() - 7200000
        },
        {
            id: 'c2',
            username: 'tiktok_fan',
            text: 'Хочу тоже так научиться танцевать!',
            likes: 89,
            createdAt: Date.now() - 10800000
        }
    ];
}

// ====================== ЗАПУСК СЕРВЕРА ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 TikTok сервер запущен на порту ${PORT}`);
    console.log(`📱 Откройте: http://localhost:${PORT}`);
    console.log(`🎬 Видео работают! Комментарии работают! Студия работает!`);
    
    loadDemoData();
});
