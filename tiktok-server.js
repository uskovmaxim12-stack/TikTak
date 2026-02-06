// ====================== TIKTOK FULL CLONE - ВСЕ В ОДНОМ ФАЙЛЕ ======================
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();

// Автосоздание папок
['uploads/videos', 'uploads/audio', 'uploads/thumbs', 'tmp'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// База данных в памяти (минимум зависимостей)
const db = {
    users: new Map(),
    videos: new Map(),
    comments: new Map(),
    messages: new Map(),
    sessions: new Map()
};

// Middleware
app.use(express.json());
app.use(express.static('.'));

// CORS для всех устройств
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// Хранилище файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = file.fieldname === 'audio' ? 'audio' : 'videos';
        cb(null, `uploads/${type}`);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;
        cb(null, name);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// ====================== ВСЕ API ЭНДПОИНТЫ ======================

// 1. Аутентификация
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (db.users.has(username)) {
        return res.json({ error: 'User exists' });
    }
    
    const user = {
        id: crypto.randomBytes(16).toString('hex'),
        username,
        password, // В реальном приложении хэшируйте!
        profilePic: `/api/default-avatar?username=${username}`,
        followers: [],
        following: [],
        createdAt: Date.now()
    };
    
    db.users.set(username, user);
    res.json({ success: true, user });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.get(username);
    
    if (user && user.password === password) {
        const token = crypto.randomBytes(32).toString('hex');
        db.sessions.set(token, user.id);
        res.json({ token, user });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// 2. Загрузка и монтаж видео
app.post('/api/video/upload', upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]), async (req, res) => {
    try {
        const { caption, effects, musicTime, trimStart, trimEnd } = req.body;
        const videoFile = req.files['video'][0];
        
        // Генерация превью
        const thumbPath = `uploads/thumbs/${videoFile.filename}.jpg`;
        exec(`ffmpeg -i "${videoFile.path}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${thumbPath}"`, () => {
            // Превью создано
        });
        
        // Применение эффектов и музыки
        let finalVideo = videoFile.path;
        
        if (req.files['audio']) {
            const audioFile = req.files['audio'][0];
            finalVideo = `tmp/mixed_${Date.now()}.mp4`;
            
            const ffmpegCmd = `ffmpeg -i "${videoFile.path}" -i "${audioFile.path}" ` +
                             `-filter_complex "[0:a]volume=0.3[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest" ` +
                             `-c:v copy "${finalVideo}"`;
            
            exec(ffmpegCmd, (err) => {
                if (!err) {
                    videoFile.path = finalVideo;
                }
            });
        }
        
        // Сохранение в БД
        const video = {
            id: crypto.randomBytes(16).toString('hex'),
            userId: req.headers['user-id'],
            username: req.headers['username'],
            videoUrl: `/uploads/videos/${videoFile.filename}`,
            thumbUrl: `/uploads/thumbs/${videoFile.filename}.jpg`,
            caption,
            effects: effects ? JSON.parse(effects) : [],
            hashtags: (caption.match(/#\w+/g) || []).map(tag => tag.substring(1)),
            likes: [],
            comments: [],
            shares: 0,
            views: 0,
            duration: 60,
            createdAt: Date.now()
        };
        
        db.videos.set(video.id, video);
        
        // Алгоритм рекомендаций
        updateRecommendations(video);
        
        res.json({ success: true, video });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Лента с алгоритмом рекомендаций
const videoWeights = new Map();
function updateRecommendations(video) {
    const weight = video.likes.length * 2 + video.comments.length * 3 + video.views * 0.1;
    videoWeights.set(video.id, weight + (Date.now() - video.createdAt) / 100000);
}

app.get('/api/feed', (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    
    const videos = Array.from(db.videos.values())
        .sort((a, b) => {
            const aWeight = videoWeights.get(a.id) || 0;
            const bWeight = videoWeights.get(b.id) || 0;
            return bWeight - aWeight;
        })
        .slice((page - 1) * limit, page * limit);
    
    res.json(videos);
});

// 4. Взаимодействия
app.post('/api/video/:id/like', (req, res) => {
    const video = db.videos.get(req.params.id);
    const { userId } = req.body;
    
    if (video && !video.likes.includes(userId)) {
        video.likes.push(userId);
        updateRecommendations(video);
    }
    
    res.json({ success: true, likes: video.likes.length });
});

app.post('/api/video/:id/comment', (req, res) => {
    const video = db.videos.get(req.params.id);
    const { userId, text } = req.body;
    
    const comment = {
        id: crypto.randomBytes(8).toString('hex'),
        userId,
        text,
        likes: 0,
        timestamp: Date.now()
    };
    
    video.comments.push(comment);
    updateRecommendations(video);
    
    res.json({ success: true, comment });
});

// 5. Прямые трансляции
const liveStreams = new Map();
app.post('/api/live/start', (req, res) => {
    const streamId = crypto.randomBytes(8).toString('hex');
    const stream = {
        id: streamId,
        userId: req.body.userId,
        viewers: [],
        messages: [],
        startedAt: Date.now(),
        isActive: true
    };
    
    liveStreams.set(streamId, stream);
    res.json({ streamId, rtmpUrl: `rtmp://localhost/live/${streamId}` });
});

// 6. Поиск и хэштеги
app.get('/api/search', (req, res) => {
    const { q, type = 'all' } = req.query;
    const results = {
        videos: [],
        users: [],
        hashtags: []
    };
    
    if (type === 'all' || type === 'videos') {
        results.videos = Array.from(db.videos.values())
            .filter(v => v.caption.toLowerCase().includes(q.toLowerCase()))
            .slice(0, 20);
    }
    
    if (type === 'all' || type === 'users') {
        results.users = Array.from(db.users.values())
            .filter(u => u.username.toLowerCase().includes(q.toLowerCase()))
            .slice(0, 10);
    }
    
    res.json(results);
});

// 7. Уведомления в реальном времени
const wss = new WebSocket.Server({ port: 8080 });
const connections = new Map();

wss.on('connection', (ws, req) => {
    const userId = new URL(req.url, 'http://localhost').searchParams.get('userId');
    connections.set(userId, ws);
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        handleRealtimeMessage(msg, userId);
    });
    
    ws.on('close', () => connections.delete(userId));
});

function handleRealtimeMessage(msg, userId) {
    switch (msg.type) {
        case 'typing':
            broadcastToChat(msg.chatId, { type: 'typing', userId });
            break;
        case 'view':
            const video = db.videos.get(msg.videoId);
            if (video) video.views++;
            break;
    }
}

function broadcastToUser(userId, data) {
    const ws = connections.get(userId);
    if (ws) ws.send(JSON.stringify(data));
}

// 8. Монтаж видео - эффекты и фильтры
app.post('/api/video/effects', upload.single('video'), (req, res) => {
    const { effects } = req.body;
    const effectsConfig = JSON.parse(effects);
    
    let filters = [];
    
    if (effectsConfig.filter) {
        switch(effectsConfig.filter) {
            case 'vintage': filters.push('curves=preset=vintage'); break;
            case 'drama': filters.push('eq=contrast=1.5:brightness=-0.1:saturation=1.2'); break;
            case 'warm': filters.push('colorbalance=rs=0.1:gs=0.1:bs=-0.1'); break;
        }
    }
    
    if (effectsConfig.speed) {
        filters.push(`setpts=${1/effectsConfig.speed}*PTS`);
    }
    
    if (effectsConfig.text) {
        // Добавление текста поверх видео
        const text = effectsConfig.text.replace(/:/g, '\\:');
        filters.push(`drawtext=text='${text}':x=(w-text_w)/2:y=h-60:fontsize=24:fontcolor=white`);
    }
    
    const outputPath = `tmp/edited_${Date.now()}.mp4`;
    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    
    exec(`ffmpeg -i "${req.file.path}" ${filterChain} -c:a copy "${outputPath}"`, (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ 
                url: `/uploads/edited/${path.basename(outputPath)}`,
                downloadUrl: outputPath 
            });
        }
    });
});

// 9. Аудио библиотека (трендовые звуки)
const audioLibrary = [
    { id: 'sound1', name: 'Trending Sound', url: '/api/audio/trending', uses: 154000 },
    { id: 'sound2', name: 'Viral Dance', url: '/api/audio/viral', uses: 98000 },
    { id: 'sound3', name: 'Comedy Effect', url: '/api/audio/comedy', uses: 67000 }
];

app.get('/api/audio/trending', (req, res) => {
    res.json(audioLibrary.sort((a, b) => b.uses - a.uses).slice(0, 50));
});

// 10. Статистика
app.get('/api/analytics/:userId', (req, res) => {
    const userVideos = Array.from(db.videos.values())
        .filter(v => v.userId === req.params.userId);
    
    const stats = {
        totalViews: userVideos.reduce((sum, v) => sum + v.views, 0),
        totalLikes: userVideos.reduce((sum, v) => sum + v.likes.length, 0),
        totalVideos: userVideos.length,
        topVideo: userVideos.sort((a, b) => b.views - a.views)[0],
        engagementRate: userVideos.length > 0 ? 
            (userVideos.reduce((sum, v) => sum + v.likes.length, 0) / userVideos.reduce((sum, v) => sum + v.views, 1) * 100).toFixed(2) : 0
    };
    
    res.json(stats);
});

// 11. Отдача статики
app.get('/uploads/:type/:filename', (req, res) => {
    res.sendFile(path.join(__dirname, 'uploads', req.params.type, req.params.filename));
});

app.get('/api/default-avatar', (req, res) => {
    const { username } = req.query;
    const colors = ['#FF0050', '#00F2EA', '#FFC700', '#8A2BE2'];
    const color = colors[crypto.createHash('md5').update(username).digest().readUInt32BE() % colors.length];
    
    const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="${color}"/>
        <text x="100" y="120" font-family="Arial" font-size="80" fill="white" text-anchor="middle">
            ${username.charAt(0).toUpperCase()}
        </text>
    </svg>`;
    
    res.header('Content-Type', 'image/svg+xml');
    res.send(svg);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ TikTok Server запущен на порту ${PORT}`);
    console.log(`📱 Доступно по: http://localhost:${PORT}/client.html`);
    console.log(`📹 Загрузка видео: POST http://localhost:${PORT}/api/video/upload`);
    console.log(`🎵 WebSocket для уведомлений: ws://localhost:8080`);
});

// Экспорт для тестирования
module.exports = { app, db, liveStreams };
