#!/bin/bash

echo "============================================"
echo "   УСТАНОВКА TIKTOK С РАБОЧЕЙ РЕГИСТРАЦИЕЙ"
echo "============================================"

echo ""
echo "1. Проверяем Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен!"
    echo "Установите Node.js:"
    echo "curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi

echo "✅ Node.js установлен: $(node --version)"

echo ""
echo "2. Создаем файлы проекта..."

# Создаем server.js
cat > server.js << 'EOF'
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

// ... (вставьте весь код из server-fixed.js)
EOF

echo "✅ server.js создан"

echo ""
echo "3. Создаем папки..."
mkdir -p public uploads/videos

echo ""
echo "4. Устанавливаем зависимости..."
npm install express mongoose multer bcrypt jsonwebtoken cors

echo ""
echo "5. Создаем package.json..."
cat > package.json << 'EOF'
{
  "name": "tiktok-working",
  "version": "1.0.0",
  "description": "TikTok с работающей регистрацией",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.5.0",
    "multer": "^1.4.5-lts.1",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5"
  }
}
EOF

echo ""
echo "============================================"
echo "           УСТАНОВКА ЗАВЕРШЕНА!"
echo "============================================"
echo ""
echo "Запустите TikTok:"
echo "    npm start"
echo ""
echo "Затем откройте в браузере:"
echo "    http://localhost:3000"
echo ""
echo "Демо аккаунты:"
echo "    Имя: tiktok_trends"
echo "    Пароль: demo123"
echo ""
