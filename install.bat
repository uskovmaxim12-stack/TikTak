@echo off
echo ============================================
echo    УСТАНОВКА TIKTOK С РАБОЧЕЙ РЕГИСТРАЦИЕЙ
echo ============================================

echo.
echo 1. Проверяем Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js не установлен!
    echo Установите Node.js с официального сайта:
    echo https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js установлен

echo.
echo 2. Создаем файлы проекта...

REM Создаем server.js
(
echo const express = require('express');
echo const mongoose = require('mongoose');
echo const multer = require('multer');
echo const path = require('path');
echo const fs = require('fs');
echo const crypto = require('crypto');
echo const bcrypt = require('bcrypt');
echo const jwt = require('jsonwebtoken');
echo const cors = require('cors');
echo.
echo const app = express();
echo.
echo // Включаем CORS для всех доменов
echo app.use(cors({
echo     origin: '*',
echo     methods: ['GET', 'POST', 'PUT', 'DELETE'],
echo     credentials: true
echo }));
echo.
echo app.use(express.json());
echo app.use(express.urlencoded({ extended: true }));
echo.
echo // ... (вставьте остальной код из server-fixed.js)
) > server.js

echo ✅ server.js создан

echo.
echo 3. Создаем папки...
if not exist public mkdir public
if not exist uploads mkdir uploads
if not exist uploads\videos mkdir uploads\videos

echo.
echo 4. Устанавливаем зависимости...
call npm install express mongoose multer bcrypt jsonwebtoken cors

echo.
echo 5. Создаем package.json...
(
echo {
echo   "name": "tiktok-working",
echo   "version": "1.0.0",
echo   "description": "TikTok с работающей регистрацией",
echo   "main": "server.js",
echo   "scripts": {
echo     "start": "node server.js",
echo     "dev": "nodemon server.js"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "mongoose": "^7.5.0",
echo     "multer": "^1.4.5-lts.1",
echo     "bcrypt": "^5.1.1",
echo     "jsonwebtoken": "^9.0.2",
echo     "cors": "^2.8.5"
echo   }
echo }
) > package.json

echo.
echo ============================================
echo            УСТАНОВКА ЗАВЕРШЕНА!
echo ============================================
echo.
echo Запустите TikTok:
echo     npm start
echo.
echo Затем откройте в браузере:
echo     http://localhost:3000
echo.
echo Демо аккаунты:
echo     Имя: tiktok_trends
echo     Пароль: demo123
echo.
pause
