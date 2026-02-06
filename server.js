const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// Подключение к MongoDB
mongoose.connect('mongodb://localhost/tiktok', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// ====================== МОДЕЛИ БАЗЫ ДАННЫХ ======================

// Пользователь
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' },
    bio: { type: String, default: '' },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
    saved: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
    createdAt: { type: Date, default: Date.now },
    isVerified: { type: Boolean, default: false },
    private: { type: Boolean, default: false }
});

// Видео
const videoSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    videoUrl: { type: String, required: true },
    thumbnail: { type: String, required: true },
    caption: { type: String, default: '' },
    hashtags: [{ type: String }],
    sound: { type: String, default: 'Оригинальный звук' },
    soundId: { type: String },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: { type: String },
        text: { type: String },
        likes: { type: Number, default: 0 },
        replies: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            username: { type: String },
            text: { type: String },
            likes: { type: Number, default: 0 }
        }],
        createdAt: { type: Date, default: Date.now }
    }],
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    duration: { type: Number, required: true },
    aspectRatio: { type: String, default: '9:16' },
    location: { type: String },
    allowsDuet: { type: Boolean, default: true },
    allowsComment: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false }
});

// Сообщения
const messageSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    seen: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Уведомления
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment', 'follow', 'mention', 'share'] },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromUsername: { type: String },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
    text: { type: String },
    seen: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Video = mongoose.model('Video', videoSchema);
const Message = mongoose.model('Message', messageSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// ====================== АВТОРИЗАЦИЯ ======================
const SECRET_KEY = 'tiktok-secret-key-2024';

// Middleware для проверки токена
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Неверный токен' });
    }
};

// Регистрация
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Проверка существования пользователя
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        // Хэширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание пользователя
        const user = new User({
            username,
            email,
            password: hashedPassword,
            profilePic: `https://ui-avatars.com/api/?name=${username}&background=FF0050&color=fff`
        });

        await user.save();

        // Создание токена
        const token = jwt.sign({ userId: user._id }, SECRET_KEY, { expiresIn: '30d' });

        res.status(201).json({
            token,
            user: {
                id: user._id,
                username: user.username,
                profilePic: user.profilePic,
                followers: user.followers.length,
                following: user.following.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Поиск пользователя
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Неверные данные' });
        }

        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверные данные' });
        }

        // Создание токена
        const token = jwt.sign({ userId: user._id }, SECRET_KEY, { expiresIn: '30d' });

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                profilePic: user.profilePic,
                followers: user.followers.length,
                following: user.following.length,
                bio: user.bio,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== ПРОФИЛЬ ======================

// Получить профиль
app.get('/api/profile/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
            .populate('followers', 'username profilePic')
            .populate('following', 'username profilePic');

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const videos = await Video.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        const likedVideos = await Video.find({ likes: user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({
            user: {
                id: user._id,
                username: user.username,
                profilePic: user.profilePic,
                bio: user.bio,
                followers: user.followers,
                following: user.following,
                followersCount: user.followers.length,
                followingCount: user.following.length,
                videosCount: videos.length,
                likesCount: likedVideos.length,
                isVerified: user.isVerified,
                private: user.private,
                createdAt: user.createdAt
            },
            videos,
            likedVideos
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обновить профиль
app.put('/api/profile', authenticate, async (req, res) => {
    try {
        const { bio, profilePic, private: isPrivate } = req.body;
        
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (bio !== undefined) user.bio = bio;
        if (profilePic !== undefined) user.profilePic = profilePic;
        if (isPrivate !== undefined) user.private = isPrivate;

        await user.save();

        res.json({
            user: {
                id: user._id,
                username: user.username,
                profilePic: user.profilePic,
                bio: user.bio,
                private: user.private
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== ПОДПИСКИ ======================

// Подписаться/отписаться
app.post('/api/follow/:userId', authenticate, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const currentUser = await User.findById(req.userId);

        const isFollowing = currentUser.following.includes(targetUser._id);

        if (isFollowing) {
            // Отписаться
            currentUser.following = currentUser.following.filter(
                id => !id.equals(targetUser._id)
            );
            targetUser.followers = targetUser.followers.filter(
                id => !id.equals(currentUser._id)
            );
        } else {
            // Подписаться
            currentUser.following.push(targetUser._id);
            targetUser.followers.push(currentUser._id);

            // Создать уведомление
            const notification = new Notification({
                userId: targetUser._id,
                type: 'follow',
                fromUserId: currentUser._id,
                fromUsername: currentUser.username
            });
            await notification.save();
        }

        await currentUser.save();
        await targetUser.save();

        res.json({
            isFollowing: !isFollowing,
            followersCount: targetUser.followers.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить подписчиков
app.get('/api/followers/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .populate('followers', 'username profilePic bio')
            .select('followers');

        res.json(user.followers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить подписки
app.get('/api/following/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .populate('following', 'username profilePic bio')
            .select('following');

        res.json(user.following);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== ВИДЕО ======================

// Загрузка видео
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/videos';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Только видео файлы!'));
        }
    }
});

// Загрузить видео
app.post('/api/videos/upload', authenticate, upload.single('video'), async (req, res) => {
    try {
        const { caption, hashtags, sound, allowsDuet, allowsComment } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Видео не загружено' });
        }

        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Генерация thumbnail (в реальном приложении используйте FFmpeg)
        const thumbnail = `https://img.youtube.com/vi/${crypto.randomBytes(10).toString('hex')}/hqdefault.jpg`;

        const video = new Video({
            userId: user._id,
            username: user.username,
            videoUrl: `/uploads/videos/${req.file.filename}`,
            thumbnail,
            caption,
            hashtags: hashtags ? hashtags.split(',').map(tag => tag.trim().toLowerCase()) : [],
            sound: sound || 'Оригинальный звук',
            duration: 60, // В реальном приложении определяйте через FFmpeg
            allowsDuet: allowsDuet !== 'false',
            allowsComment: allowsComment !== 'false'
        });

        await video.save();
        user.videos.push(video._id);
        await user.save();

        res.status(201).json({
            video: {
                id: video._id,
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
        res.status(500).json({ error: error.message });
    }
});

// Лента видео
app.get('/api/videos/feed', authenticate, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Получаем подписки пользователя
        const user = await User.findById(req.userId).select('following');
        const followingIds = user.following.map(id => id);

        // Видео от подписок + популярные видео
        const videos = await Video.aggregate([
            {
                $match: {
                    $or: [
                        { userId: { $in: followingIds } },
                        { likes: { $size: { $gt: 1000 } } } // Популярные видео
                    ],
                    isPrivate: false
                }
            },
            {
                $addFields: {
                    popularity: {
                        $add: [
                            { $multiply: [{ $size: "$likes" }, 2] },
                            { $multiply: [{ $size: "$comments" }, 3] },
                            "$views",
                            { $cond: [{ $in: ["$userId", followingIds] }, 1000, 0] }
                        ]
                    }
                }
            },
            { $sort: { popularity: -1, createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' }
        ]);

        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Популярные видео
app.get('/api/videos/trending', async (req, res) => {
    try {
        const videos = await Video.aggregate([
            { $match: { isPrivate: false } },
            {
                $addFields: {
                    popularity: {
                        $add: [
                            { $multiply: [{ $size: "$likes" }, 2] },
                            { $multiply: [{ $size: "$comments" }, 3] },
                            "$shares",
                            "$views"
                        ]
                    }
                }
            },
            { $sort: { popularity: -1 } },
            { $limit: 50 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' }
        ]);

        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Поиск видео
app.get('/api/videos/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);

        const videos = await Video.find({
            $or: [
                { caption: { $regex: query, $options: 'i' } },
                { hashtags: { $in: [query.toLowerCase()] } },
                { username: { $regex: query, $options: 'i' } }
            ],
            isPrivate: false
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('userId', 'username profilePic');

        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== ЛАЙКИ ======================

// Поставить/убрать лайк
app.post('/api/videos/:videoId/like', authenticate, async (req, res) => {
    try {
        const video = await Video.findById(req.params.videoId);
        if (!video) {
            return res.status(404).json({ error: 'Видео не найден' });
        }

        const user = await User.findById(req.userId);
        const hasLiked = video.likes.includes(user._id);

        if (hasLiked) {
            // Убрать лайк
            video.likes = video.likes.filter(id => !id.equals(user._id));
            user.likes = user.likes.filter(id => !id.equals(video._id));
        } else {
            // Поставить лайк
            video.likes.push(user._id);
            user.likes.push(video._id);

            // Создать уведомление (если не свой лайк)
            if (!video.userId.equals(user._id)) {
                const notification = new Notification({
                    userId: video.userId,
                    type: 'like',
                    fromUserId: user._id,
                    fromUsername: user.username,
                    videoId: video._id
                });
                await notification.save();
            }
        }

        await video.save();
        await user.save();

        res.json({
            likes: video.likes.length,
            hasLiked: !hasLiked
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== КОММЕНТАРИИ ======================

// Добавить комментарий
app.post('/api/videos/:videoId/comments', authenticate, async (req, res) => {
    try {
        const { text } = req.body;
        const video = await Video.findById(req.params.videoId);
        
        if (!video) {
            return res.status(404).json({ error: 'Видео не найден' });
        }

        if (!video.allowsComment) {
            return res.status(403).json({ error: 'Комментарии отключены' });
        }

        const user = await User.findById(req.userId);

        const comment = {
            userId: user._id,
            username: user.username,
            text,
            likes: 0,
            replies: [],
            createdAt: new Date()
        };

        video.comments.push(comment);
        await video.save();

        // Создать уведомление (если не свой комментарий)
        if (!video.userId.equals(user._id)) {
            const notification = new Notification({
                userId: video.userId,
                type: 'comment',
                fromUserId: user._id,
                fromUsername: user.username,
                videoId: video._id,
                text: text.substring(0, 50)
            });
            await notification.save();
        }

        res.status(201).json(comment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить комментарии
app.get('/api/videos/:videoId/comments', async (req, res) => {
    try {
        const video = await Video.findById(req.params.videoId)
            .select('comments')
            .populate('comments.userId', 'username profilePic');

        res.json(video.comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Лайкнуть комментарий
app.post('/api/comments/:commentId/like', authenticate, async (req, res) => {
    try {
        // Находим видео с этим комментарием
        const video = await Video.findOne({ 'comments._id': req.params.commentId });
        if (!video) {
            return res.status(404).json({ error: 'Комментарий не найден' });
        }

        const comment = video.comments.id(req.params.commentId);
        comment.likes += 1;
        await video.save();

        res.json({ likes: comment.likes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ответить на комментарий
app.post('/api/comments/:commentId/reply', authenticate, async (req, res) => {
    try {
        const { text } = req.body;
        const video = await Video.findOne({ 'comments._id': req.params.commentId });
        
        if (!video) {
            return res.status(404).json({ error: 'Комментарий не найден' });
        }

        const user = await User.findById(req.userId);
        const comment = video.comments.id(req.params.commentId);

        const reply = {
            userId: user._id,
            username: user.username,
            text,
            likes: 0
        };

        comment.replies.push(reply);
        await video.save();

        res.status(201).json(reply);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== СООБЩЕНИЯ ======================

// Отправить сообщение
app.post('/api/messages', authenticate, async (req, res) => {
    try {
        const { to, text } = req.body;

        const message = new Message({
            from: req.userId,
            to,
            text
        });

        await message.save();
        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить диалог
app.get('/api/messages/:userId', authenticate, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { from: req.userId, to: req.params.userId },
                { from: req.params.userId, to: req.userId }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('from', 'username profilePic')
        .populate('to', 'username profilePic');

        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить чаты
app.get('/api/chats', authenticate, async (req, res) => {
    try {
        const messages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { from: mongoose.Types.ObjectId(req.userId) },
                        { to: mongoose.Types.ObjectId(req.userId) }
                    ]
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$from", mongoose.Types.ObjectId(req.userId)] },
                            "$to",
                            "$from"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$from", mongoose.Types.ObjectId(req.userId)] },
                                        { $eq: ["$seen", false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Заполняем информацию о пользователях
        const chats = await Promise.all(
            messages.map(async (chat) => {
                const user = await User.findById(chat._id)
                    .select('username profilePic');
                return {
                    user,
                    lastMessage: chat.lastMessage,
                    unreadCount: chat.unreadCount
                };
            })
        );

        res.json(chats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== УВЕДОМЛЕНИЯ ======================

// Получить уведомления
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('fromUserId', 'username profilePic')
            .populate('videoId', 'thumbnail caption');

        // Помечаем как прочитанные
        await Notification.updateMany(
            { userId: req.userId, seen: false },
            { seen: true }
        );

        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====================== СТАТИЧЕСКИЕ ФАЙЛЫ ======================

// Папка для загруженных видео
app.use('/uploads', express.static('uploads'));

// Статические файлы клиента
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====================== ЗАГРУЗКА ДЕМО ДАННЫХ ======================

async function loadDemoData() {
    try {
        // Проверяем, есть ли уже данные
        const videoCount = await Video.countDocuments();
        if (videoCount === 0) {
            console.log('Загрузка демо данных...');

            // Создаем демо пользователей
            const demoUsers = [];
            for (let i = 1; i <= 100; i++) {
                const user = new User({
                    username: `user${i}`,
                    email: `user${i}@demo.com`,
                    password: await bcrypt.hash('password123', 10),
                    profilePic: `https://i.pravatar.cc/150?img=${i}`,
                    bio: `Демо пользователь ${i}`,
                    isVerified: i % 10 === 0,
                    private: i % 20 === 0
                });
                await user.save();
                demoUsers.push(user);
            }

            // Создаем демо видео (1000 видео)
            const videoPromises = [];
            for (let i = 1; i <= 1000; i++) {
                const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
                
                // Используем реальные видео с YouTube (публичные)
                const videoSources = [
                    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
                    'https://www.youtube.com/watch?v=9bZkp7q19f0', // PSY - GANGNAM STYLE
                    'https://www.youtube.com/watch?v=kJQP7kiw5Fk', // Luis Fonsi - Despacito
                    'https://www.youtube.com/watch?v=CduA0TULnow', // Shakira - Waka Waka
                    'https://www.youtube.com/watch?v=JGwWNGJdvx8', // Ed Sheeran - Shape of You
                    'https://www.youtube.com/watch?v=7wtfhZwyrcc', // Imagine Dragons - Believer
                    'https://www.youtube.com/watch?v=OPf0YbXqDm0', // Mark Ronson - Uptown Funk
                    'https://www.youtube.com/watch?v=RgKAFK5djSk', // Wiz Khalifa - See You Again
                    'https://www.youtube.com/watch?v=oyEuk8j8imI', // Taylor Swift - Love Story
                    'https://www.youtube.com/watch?v=QcIy9NiNbmo'  // Katy Perry - Roar
                ];

                const videoSource = videoSources[Math.floor(Math.random() * videoSources.length)];
                const videoId = videoSource.split('v=')[1];

                const video = new Video({
                    userId: user._id,
                    username: user.username,
                    videoUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
                    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                    caption: `Трендовое видео #${i} - ${['танцы', 'музыка', 'комедия', 'спорт', 'путешествия', 'еда', 'животные', 'мода'][Math.floor(Math.random() * 8)]}`,
                    hashtags: ['тренд', 'вирус', 'развлечения', '2024'],
                    sound: ['Оригинальный звук', 'Трендовый звук', 'Популярная музыка'][Math.floor(Math.random() * 3)],
                    likes: Array.from({ length: Math.floor(Math.random() * 10000) }, () => 
                        demoUsers[Math.floor(Math.random() * demoUsers.length)]._id
                    ),
                    comments: Array.from({ length: Math.floor(Math.random() * 100) }, (_, index) => ({
                        userId: demoUsers[Math.floor(Math.random() * demoUsers.length)]._id,
                        username: `user${Math.floor(Math.random() * 100) + 1}`,
                        text: `Отличное видео! #${index}`,
                        likes: Math.floor(Math.random() * 100),
                        replies: []
                    })),
                    shares: Math.floor(Math.random() * 1000),
                    views: Math.floor(Math.random() * 1000000),
                    duration: 60 + Math.floor(Math.random() * 180),
                    createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000000))
                });

                videoPromises.push(video.save());
            }

            await Promise.all(videoPromises);

            // Создаем подписки
            for (const user of demoUsers) {
                const followingCount = Math.floor(Math.random() * 50);
                for (let i = 0; i < followingCount; i++) {
                    const randomUser = demoUsers[Math.floor(Math.random() * demoUsers.length)];
                    if (!user.following.includes(randomUser._id) && !user._id.equals(randomUser._id)) {
                        user.following.push(randomUser._id);
                        randomUser.followers.push(user._id);
                    }
                }
                await user.save();
            }

            console.log('✅ Демо данные загружены: 100 пользователей, 1000 видео');
        }
    } catch (error) {
        console.error('Ошибка загрузки демо данных:', error);
    }
}

// ====================== ЗАПУСК СЕРВЕРА ======================

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`🚀 TikTok сервер запущен на порту ${PORT}`);
    console.log(`📱 Откройте: http://localhost:${PORT}`);
    console.log(`🔧 API доступен по: http://localhost:${PORT}/api`);
    
    // Загружаем демо данные
    await loadDemoData();
});

module.exports = app;
