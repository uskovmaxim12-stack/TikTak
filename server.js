const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Настройка базы данных
const db = new sqlite3.Database(':memory:');

// Инициализация базы данных
db.serialize(() => {
    // Таблица видео
    db.run(`CREATE TABLE videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        duration INTEGER,
        views INTEGER DEFAULT 0,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_type TEXT CHECK(source_type IN ('youtube', 'tiktok', 'upload'))
    )`);

    // Таблица администраторов
    db.run(`CREATE TABLE admins (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT
    )`);

    // Добавляем админа по умолчанию
    db.run(`INSERT INTO admins (username, password_hash) 
            VALUES ('admin', '$2b$10$YourHashedPasswordHere')`);
});

// Настройка загрузки видео
const storage = multer.diskStorage({
    destination: 'public/uploads/',
    filename: (req, file, cb) => {
        cb(null, `video_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// Проверка админа (упрощенная)
const checkAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader === 'Bearer admin-secret-token') {
        next();
    } else {
        res.status(403).json({ error: 'Только администратор может публиковать видео' });
    }
};

// API Endpoints

// Получить все видео (с пагинацией)
app.get('/api/videos', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    db.all(
        `SELECT * FROM videos ORDER BY upload_date DESC LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, videos) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Обновляем просмотры
            videos.forEach(video => {
                db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [video.id]);
            });
            
            res.json(videos);
        }
    );
});

// Поиск видео
app.get('/api/videos/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
        res.json([]);
        return;
    }

    db.all(
        `SELECT * FROM videos WHERE title LIKE ? OR description LIKE ? ORDER BY views DESC`,
        [`%${query}%`, `%${query}%`],
        (err, videos) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(videos);
        }
    );
});

// Админ: загрузить новое видео
app.post('/api/admin/upload', checkAdmin, upload.single('video'), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'Видео файл не загружен' });
        return;
    }

    const { title, description } = req.body;
    const videoUrl = `/uploads/${req.file.filename}`;

    // Генерация превью
    const thumbnailName = `thumb_${Date.now()}.jpg`;
    const thumbnailPath = `public/uploads/${thumbnailName}`;

    ffmpeg(req.file.path)
        .screenshots({
            timestamps: ['50%'],
            filename: thumbnailName,
            folder: 'public/uploads/'
        })
        .on('end', () => {
            // Получаем длительность видео
            ffmpeg.ffprobe(req.file.path, (err, metadata) => {
                const duration = Math.round(metadata.format.duration);

                // Сохраняем в базу
                db.run(
                    `INSERT INTO videos (title, description, video_url, thumbnail_url, duration, source_type) 
                     VALUES (?, ?, ?, ?, ?, 'upload')`,
                    [title, description, videoUrl, `/uploads/${thumbnailName}`, duration],
                    function(err) {
                        if (err) {
                            res.status(500).json({ error: err.message });
                            return;
                        }
                        res.json({ 
                            id: this.lastID,
                            message: 'Видео успешно загружено',
                            videoUrl: videoUrl
                        });
                    }
                );
            });
        });
});

// Импорт видео с YouTube/TikTok
app.post('/api/admin/import', checkAdmin, async (req, res) => {
    const { videos } = req.body;
    
    if (!Array.isArray(videos) || videos.length === 0) {
        res.status(400).json({ error: 'Массив видео обязателен' });
        return;
    }

    const imported = [];
    const errors = [];

    for (const videoData of videos) {
        try {
            db.run(
                `INSERT INTO videos (title, description, video_url, thumbnail_url, duration, source_type)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    videoData.title || 'Без названия',
                    videoData.description || '',
                    videoData.video_url,
                    videoData.thumbnail_url || '/default-thumbnail.jpg',
                    videoData.duration || 60,
                    videoData.source_type || 'youtube'
                ],
                function(err) {
                    if (err) {
                        errors.push({ video: videoData, error: err.message });
                    } else {
                        imported.push({ id: this.lastID, ...videoData });
                    }
                }
            );
        } catch (error) {
            errors.push({ video: videoData, error: error.message });
        }
    }

    // Ждем завершения всех операций
    setTimeout(() => {
        res.json({
            imported: imported.length,
            errors: errors.length,
            details: { imported, errors }
        });
    }, 1000);
});

// Генерация 1000 тестовых видео
app.post('/api/admin/generate-videos', checkAdmin, (req, res) => {
    const videoCategories = [
        'Комедия', 'Музыка', 'Танцы', 'Образование', 'Кулинария',
        'Спорт', 'Игры', 'Красота', 'Путешествия', 'Животные'
    ];

    const youtubeVideoIds = [
        'dQw4w9WgXcQ', '9bZkp7q19f0', 'kffacxfA7G4', 'CduA0TULnow',
        'JGwWNGJdvx8', 'OPf0YbXqDm0', 'KYniUCGOx6w', 'ASO_zypdnsQ'
    ];

    const videos = [];
    
    for (let i = 1; i <= 1000; i++) {
        const category = videoCategories[Math.floor(Math.random() * videoCategories.length)];
        const youtubeId = youtubeVideoIds[Math.floor(Math.random() * youtubeVideoIds.length)];
        
        videos.push({
            title: `${category} видео #${i}`,
            description: `Автоматически сгенерированное видео в категории ${category}`,
            video_url: `https://www.youtube.com/watch?v=${youtubeId}`,
            thumbnail_url: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
            duration: Math.floor(Math.random() * 300) + 30,
            source_type: Math.random() > 0.5 ? 'youtube' : 'tiktok',
            views: Math.floor(Math.random() * 1000000)
        });
    }

    // Добавляем видео в базу пакетами
    const batchSize = 100;
    let processed = 0;

    const insertBatch = (batch) => {
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
        const values = [];

        batch.forEach(video => {
            values.push(
                video.title,
                video.description,
                video.video_url,
                video.thumbnail_url,
                video.duration,
                video.source_type
            );
        });

        db.run(
            `INSERT INTO videos (title, description, video_url, thumbnail_url, duration, source_type)
             VALUES ${placeholders}`,
            values,
            (err) => {
                if (err) console.error('Ошибка вставки:', err);
                processed += batch.length;
                
                if (processed < videos.length) {
                    const nextBatch = videos.slice(processed, processed + batchSize);
                    insertBatch(nextBatch);
                } else {
                    res.json({ 
                        message: `Успешно создано ${processed} видео`,
                        total_videos: processed
                    });
                }
            }
        );
    };

    // Начинаем с первого батча
    const firstBatch = videos.slice(0, batchSize);
    insertBatch(firstBatch);
});

// Статистика
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as total_videos FROM videos', (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        db.get('SELECT SUM(views) as total_views FROM videos', (err, viewsRow) => {
            res.json({
                total_videos: row.total_videos,
                total_views: viewsRow.total_views || 0,
                server_status: 'active'
            });
        });
    });
});

// Создаем папки при запуске
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
    fs.mkdirSync('public/uploads');
}

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Откройте http://localhost:${PORT}`);
    console.log(`🔧 Админ токен: admin-secret-token`);
});
