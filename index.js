require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Автоматическое создание папок
['uploads/videos', 'uploads/thumbs', 'uploads/profiles'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Подключение MongoDB (одна коллекция для всего)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/tiktok_clone', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Упрощенная схема данных
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    profilePic: String,
    followers: [String],
    following: [String],
    createdAt: { type: Date, default: Date.now }
});

const videoSchema = new mongoose.Schema({
    userId: String,
    username: String,
    videoUrl: String,
    thumbUrl: String,
    caption: String,
    hashtags: [String],
    likes: [String],
    comments: [{
        userId: String,
        text: String,
        timestamp: Date
    }],
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Video = mongoose.model('Video', videoSchema);

// Хранилище для видео
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) cb(null, 'uploads/videos');
        else cb(null, 'uploads/profiles');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Аутентификация (JWT упрощенный)
const users = new Map();

// Основные маршруты API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (await User.findOne({ username })) {
            return res.status(400).json({ error: 'User exists' });
        }
        const user = new User({ username, password });
        await user.save();
        res.json({ success: true, userId: user._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        users.set(token, user._id.toString());
        res.json({ token, userId: user._id, username });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Загрузка видео
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { caption, hashtags, userId, username } = req.body;
        const video = new Video({
            userId,
            username,
            videoUrl: `/videos/${req.file.filename}`,
            thumbUrl: `/thumbs/${req.file.filename}.jpg`,
            caption,
            hashtags: hashtags ? hashtags.split(',') : []
        });
        await video.save();
        res.json({ success: true, videoId: video._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Лента видео (алгоритм рекомендаций)
app.get('/api/feed', async (req, res) => {
    try {
        const { userId, page = 1, limit = 10 } = req.query;
        
        // Упрощенный алгоритм: новые + популярные
        const videos = await Video.aggregate([
            {
                $addFields: {
                    popularity: {
                        $add: [
                            { $size: "$likes" },
                            { $multiply: [{ $size: "$comments" }, 2] },
                            "$views"
                        ]
                    },
                    isNew: {
                        $cond: [
                            { $gt: ["$createdAt", new Date(Date.now() - 24*60*60*1000)] },
                            1000,
                            0
                        ]
                    }
                }
            },
            { $sort: { isNew: -1, popularity: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: parseInt(limit) }
        ]);
        
        res.json(videos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Взаимодействия
app.post('/api/like/:videoId', async (req, res) => {
    const { userId } = req.body;
    await Video.findByIdAndUpdate(req.params.videoId, {
        $addToSet: { likes: userId }
    });
    res.json({ success: true });
});

app.post('/api/comment/:videoId', async (req, res) => {
    const { userId, text } = req.body;
    const video = await Video.findById(req.params.videoId);
    video.comments.push({ userId, text, timestamp: new Date() });
    await video.save();
    res.json({ success: true });
});

// Статика
app.use('/videos', express.static('uploads/videos'));
app.use('/thumbs', express.static('uploads/thumbs'));
app.use('/profiles', express.static('uploads/profiles'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
