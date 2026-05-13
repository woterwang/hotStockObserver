ARG BASE_IMAGE=node:20-bullseye
FROM ${BASE_IMAGE}

WORKDIR /app

COPY package.json ./package.json
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN npm install -g pm2 \
    && npm --prefix server install \
    && npm --prefix client install

COPY . .

RUN mkdir -p /app/server/logs \
    && npm run build \
    && chmod +x /app/docker/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV MONGODB_URI=mongodb://127.0.0.1:27017/hot_stock_observer
ENV START_MONGODB=false
ENV MONGO_DB_PATH=/data/db
ENV MONGO_LOG_PATH=/var/log/mongodb/mongod.log

EXPOSE 3000

ENTRYPOINT ["/app/docker/docker-entrypoint.sh"]
