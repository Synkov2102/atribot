FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Сначала зависимости — этот слой пересобирается, только когда меняется package*.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Папка для незавершённых проверок; в неё монтируется том, чтобы они переживали пересоздание контейнера
RUN mkdir -p data && chown node:node data
USER node

CMD ["node", "src/index.js"]
