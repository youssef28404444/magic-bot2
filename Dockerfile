# ✅ Node.js مع Debian (مش Alpine) عشان Chromium يشتغل
FROM node:20-slim

# ✅ تثبيت المكتبات اللي محتاجها Chromium/Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ✅ قول لـ Puppeteer يستخدم Chromium الموجود ومايحملش تاني
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

# ✅ مجلد لحفظ Session الواتساب
RUN mkdir -p .wwebjs_auth && chmod 777 .wwebjs_auth

EXPOSE 3000

CMD ["node", "index.js"]
