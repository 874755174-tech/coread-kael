#!/bin/sh
# 同时跑两个进程：网页 :3000、MCP :3001。共用一个 SQLite 文件。
# 任一进程退出 → 整个容器退出，交给 --restart 策略拉起（不会出现半个服务）。

set -u

mkdir -p "$(dirname "$COREAD_DB")"

echo "[coread] db       = $COREAD_DB"
echo "[coread] lock     = $ROOM_LOCK_PATH"
echo "[coread] gate     = $([ -n "${COREAD_TOKEN:-}" ] && echo 'ON' || echo 'OFF (!! 公网部署务必设置 COREAD_TOKEN)')"

node server.mjs &
WEB_PID=$!

node mcp-sse.mjs &
MCP_PID=$!

# POSIX 轮询，不依赖 bash 的 wait -n
while kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$MCP_PID" 2>/dev/null; do
  sleep 2
done

echo "[coread] 有进程退出了，停掉另一个让容器重启"
kill "$WEB_PID" "$MCP_PID" 2>/dev/null
wait 2>/dev/null
exit 1
