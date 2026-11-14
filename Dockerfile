# coread（共读小屋）— Kael 部署版
# 基于 meowmana/coread (MIT)，改动只有一处：把作者自带的 owner key 机制
# 变成真正的入口门禁（网页 /v1/* 与 MCP 双端都验 COREAD_TOKEN）。

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production \
    COREAD_HOST=0.0.0.0 \
    COREAD_PORT=3000 \
    COREAD_MCP_HOST=0.0.0.0 \
    COREAD_MCP_PORT=3001 \
    COREAD_DB=/data/coread.db \
    ROOM_LOCK_PATH=/data/reading-room-lock.json

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000 3001

CMD ["sh", "./docker-entrypoint.sh"]
