FROM ghcr.io/puppeteer/puppeteer:latest

# ده بيخلي الكروم يشتغل بدون الحاجات اللي بتعمل مشاكل
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# تشغيل البوت
CMD ["node", "index.js"]
