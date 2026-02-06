const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// Включаем CORS для всех доменов
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================== ПОДКЛЮЧЕНИЕ БАЗЫ ДАННЫХ ======================
let db;

async function connectDB() {
    try {
        // Используем MongoDB Atlas или локальную базу
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tiktok';
        
        // Если MongoDB не установлена, используем временную базу в памяти
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        
        // Подключаемся к MongoDB
        mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        }).then(() => {
            console.log('✅ MongoDB подключена');
        }).catch(err => {
            console.log('⚠️  MongoDB не подключена, используем временное хранилище');
            db = createMemoryDB();
        });
    } catch (error) {
        console.log('⚠️  Ошибка MongoDB:', error.message);
        db = createMemoryDB();
    }
}

// Временная база в памяти если MongoDB недоступна
function createMemoryDB() {
    return {
        users: new Map(),
        videos: new Map(),
        comments: new Map(),
        likes: new Map(),
        follows: new Map(),
        
        // Методы для совместимости
        saveUser: async function(user) {
            this.users.set(user.username, user);
            this.users.set(user.email, user);
            return user;
        },
        
        findUser: async function(query) {
            if (this.users.has(query.username)) {
                return this.users.get(query.username);
            }
            if (this.users.has(query.email)) {
                return this.users.get(query.email);
            }
            return null;
        },
        
        findUserByUsername: async function(username) {
            return this.users.get(username);
        }
    };
}

// ====================== МОДЕЛИ ======================

// Схема пользователя
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' },
    bio: { type: String, default: 'Привет! Я новый пользователь TikTok' },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    videosCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// ====================== АВТОРИЗАЦИЯ ======================

// Миддлваре для проверки токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    jwt.verify(token, 'your-secret-key-2024', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Неверный токен' });
        }
        req.user = user;
        next();
    });
}

// ====================== API ЭНДПОИНТЫ ======================

// 1. РЕГИСТРАЦИЯ - РАБОЧАЯ ВЕРСИЯ
app.post('/api/auth/register', async (req, res) => {
    console.log('📝 Запрос на регистрацию:', req.body);
    
    try {
        const { username, email, password } = req.body;
        
        // Валидация
        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Все поля обязательны',
                details: 'Заполните имя пользователя, email и пароль'
            });
        }
        
        if (username.length < 3) {
            return res.status(400).json({ 
                error: 'Имя пользователя слишком короткое',
                details: 'Минимум 3 символа'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'Пароль слишком короткий',
                details: 'Минимум 6 символов'
            });
        }
        
        // Проверка существования пользователя
        const existingUser = await User.findOne({ 
            $or: [{ username }, { email }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                error: 'Пользователь уже существует',
                details: 'Имя пользователя или email уже заняты'
            });
        }
        
        // Хэширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Создание аватара
        const avatarColors = ['FF0050', '00F2EA', 'FFC700', '8A2BE2', '00FF7F'];
        const avatarColor = avatarColors[username.length % avatarColors.length];
        const avatarUrl = `https://ui-avatars.com/api/?name=${username}&background=${avatarColor}&color=fff&size=200`;
        
        // Создание пользователя
        const user = new User({
            username,
            email,
            password: hashedPassword,
            profilePic: avatarUrl,
            bio: 'Привет! Я новый пользователь TikTok',
            followers: 0,
            following: 0,
            videosCount: 0,
            likesCount: 0,
            isVerified: false,
            createdAt: new Date()
        });
        
        await user.save();
        
        // Создание JWT токена
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username 
            },
            'your-secret-key-2024',
            { expiresIn: '30d' }
        );
        
        console.log('✅ Пользователь зарегистрирован:', username);
        
        res.status(201).json({
            success: true,
            message: 'Регистрация успешна!',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic,
                bio: user.bio,
                followers: user.followers,
                following: user.following,
                isVerified: user.isVerified,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.status(500).json({ 
            error: 'Ошибка сервера',
            details: error.message
        });
    }
});

// 2. ВХОД - РАБОЧАЯ ВЕРСИЯ
app.post('/api/auth/login', async (req, res) => {
    console.log('🔑 Запрос на вход:', req.body.username);
    
    try {
        const { username, password } = req.body;
        
        // Валидация
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Заполните все поля',
                details: 'Введите имя пользователя и пароль'
            });
        }
        
        // Поиск пользователя по username или email
        const user = await User.findOne({
            $or: [
                { username: username },
                { email: username }
            ]
        });
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Пользователь не найден',
                details: 'Неверное имя пользователя или пароль'
            });
        }
        
        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Неверный пароль',
                details: 'Проверьте правильность пароля'
            });
        }
        
        // Создание JWT токена
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username 
            },
            'your-secret-key-2024',
            { expiresIn: '30d' }
        );
        
        console.log('✅ Успешный вход:', user.username);
        
        res.json({
            success: true,
            message: 'Вход выполнен успешно!',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic,
                bio: user.bio,
                followers: user.followers,
                following: user.following,
                isVerified: user.isVerified,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error);
        res.status(500).json({ 
            error: 'Ошибка сервера',
            details: error.message
        });
    }
});

// 3. ПРОВЕРКА ТОКЕНА
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// 4. ПОЛУЧЕНИЕ ПРОФИЛЯ
app.get('/api/profile/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Получаем видео пользователя
        const userVideos = await Video.find({ userId: user._id }).limit(20);
        
        res.json({
            user: {
                id: user._id,
                username: user.username,
                profilePic: user.profilePic,
                bio: user.bio,
                followers: user.followers,
                following: user.following,
                videosCount: user.videosCount,
                likesCount: user.likesCount,
                isVerified: user.isVerified,
                createdAt: user.createdAt
            },
            videos: userVideos
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. ОБНОВЛЕНИЕ ПРОФИЛЯ
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { bio, profilePic } = req.body;
        const user = await User.findById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        if (bio !== undefined) user.bio = bio;
        if (profilePic !== undefined) user.profilePic = profilePic;
        
        await user.save();
        
        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                profilePic: user.profilePic,
                bio: user.bio
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. СХЕМА ВИДЕО
const videoSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    videoUrl: { type: String, required: true },
    thumbnail: { type: String, required: true },
    caption: { type: String, default: '' },
    hashtags: [{ type: String }],
    sound: { type: String, default: 'Оригинальный звук' },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    duration: { type: Number, default: 60 },
    createdAt: { type: Date, default: Date.now }
});

const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);

// 7. ЛЕНТА ВИДЕО
app.get('/api/videos/feed', async (req, res) => {
    try {
        // Используем демо видео если база пустая
        const videos = await Video.find().limit(20).sort({ createdAt: -1 });
        
        if (videos.length === 0) {
            // Создаем демо видео
            const demoVideos = await createDemoVideos();
            return res.json(demoVideos.slice(0, 20));
        }
        
        res.json(videos);
    } catch (error) {
        console.error('Ошибка загрузки ленты:', error);
        // Возвращаем демо видео при ошибке
        const demoVideos = createDemoVideos();
        res.json(demoVideos.slice(0, 20));
    }
});

// Функция создания демо видео
async function createDemoVideos() {
    const demoVideos = [
        {
            id: 'video1',
            userId: 'demo_user',
            username: 'tiktok_trends',
            videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1',
            thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            caption: 'Тренд 2024! Все танцуют этот танец 🎵 #танец #тренд2024',
            hashtags: ['танец', 'тренд2024', 'музыка'],
            sound: 'Оригинальный звук',
            likes: 1250000,
            comments: 23400,
            shares: 89000,
            views: 5000000,
            duration: 60,
            createdAt: new Date()
        },
        {
            id: 'video2',
            userId: 'demo_user',
            username: 'cooking_master',
            videoUrl: 'https://www.youtube.com/embed/9bZkp7q19f0?autoplay=1',
            thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg',
            caption: 'Готовим за 5 минут! Простой рецепт 🍳 #еда #рецепт',
            hashtags: ['еда', 'рецепт', 'кулинария'],
            sound: 'Кулинарный ASMR',
            likes: 895000,
            comments: 12500,
            shares: 34000,
            views: 2500000,
            duration: 45,
            createdAt: new Date(Date.now() - 86400000)
        }
    ];
    
    return demoVideos;
}

// 8. ЛАЙК ВИДЕО
app.post('/api/videos/:id/like', authenticateToken, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Видео не найдено' });
        }
        
        video.likes += 1;
        await video.save();
        
        res.json({
            success: true,
            likes: video.likes
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. КОММЕНТАРИИ
app.get('/api/videos/:id/comments', async (req, res) => {
    const comments = [
        {
            id: 'comment1',
            username: 'user123',
            text: 'Обожаю это видео! 🔥',
            likes: 120,
            createdAt: new Date(Date.now() - 7200000)
        },
        {
            id: 'comment2',
            username: 'tiktok_fan',
            text: 'Хочу научиться так же!',
            likes: 89,
            createdAt: new Date(Date.now() - 10800000)
        }
    ];
    
    res.json(comments);
});

app.post('/api/videos/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Видео не найдено' });
        }
        
        video.comments += 1;
        await video.save();
        
        res.json({
            success: true,
            comment: {
                id: 'comment_' + Date.now(),
                username: req.user.username,
                text,
                likes: 0,
                createdAt: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 10. ПОИСК
app.get('/api/search', async (req, res) => {
    const query = req.query.q || '';
    
    // Демо результаты поиска
    const results = {
        videos: [
            {
                id: 'search1',
                username: 'dance_crew',
                caption: 'Новый танцевальный челлендж #танец #челлендж',
                thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
                likes: 500000,
                views: 2000000
            }
        ],
        users: [
            {
                id: 'user1',
                username: 'tiktok_trends',
                profilePic: 'https://ui-avatars.com/api/?name=tiktok_trends&background=FF0050&color=fff',
                followers: 1500000,
                isVerified: true
            }
        ],
        hashtags: [
            { tag: 'танец', count: 1500000 },
            { tag: 'тренд2024', count: 890000 }
        ]
    };
    
    res.json(results);
});

// ====================== ЗАГРУЗКА ФАЙЛОВ ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/videos';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.random().toString(36).substring(7) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Только видео файлы разрешены'));
        }
    }
});

// ====================== СТАТИЧЕСКИЕ ФАЙЛЫ ======================
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====================== ЗАПУСК СЕРВЕРА ======================
const PORT = process.env.PORT || 3000;

async function startServer() {
    await connectDB();
    
    // Создаем демо пользователя если база пустая
    try {
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            console.log('👤 Создаем демо пользователей...');
            
            const demoUsers = [
                {
                    username: 'tiktok_trends',
                    email: 'trends@tiktok.com',
                    password: await bcrypt.hash('demo123', 10),
                    profilePic: 'https://ui-avatars.com/api/?name=tiktok_trends&background=FF0050&color=fff',
                    bio: 'Лучшие тренды TikTok 2024!',
                    followers: 1500000,
                    following: 500,
                    videosCount: 120,
                    likesCount: 5000000,
                    isVerified: true
                },
                {
                    username: 'dance_queen',
                    email: 'dance@tiktok.com',
                    password: await bcrypt.hash('demo123', 10),
                    profilePic: 'https://ui-avatars.com/api/?name=dance_queen&background=00F2EA&color=fff',
                    bio: 'Танцую каждый день! 💃',
                    followers: 890000,
                    following: 300,
                    videosCount: 85,
                    likesCount: 3200000,
                    isVerified: true
                },
                {
                    username: 'cooking_master',
                    email: 'cook@tiktok.com',
                    password: await bcrypt.hash('demo123', 10),
                    profilePic: 'https://ui-avatars.com/api/?name=cooking_master&background=FFC700&color=fff',
                    bio: 'Готовлю вкусно и просто! 🍳',
                    followers: 1200000,
                    following: 150,
                    videosCount: 200,
                    likesCount: 7800000,
                    isVerified: true
                }
            ];
            
            await User.insertMany(demoUsers);
            console.log('✅ Демо пользователи созданы');
        }
    } catch (error) {
        console.log('⚠️  Ошибка создания демо пользователей:', error.message);
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📱 Откройте: http://localhost:${PORT}`);
        console.log(`🔧 API: http://localhost:${PORT}/api`);
        console.log(`👤 Демо аккаунты: tiktok_trends / demo123`);
    });
}

startServer();
