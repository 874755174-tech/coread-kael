@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ---- 找一个可用的 node（PATH 里没有就用 WorkBuddy 自带的）----
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE set "NODE=%%i"
)
if not defined NODE (
  for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%d\node.exe" set "NODE=%%d\node.exe"
  )
)
if not defined NODE (
  echo [错误] 找不到 node，没法启动。
  echo   请把这段发给 Bunny。
  pause
  exit /b 1
)
echo 使用 node: %NODE%

if not exist "node_modules" (
  echo 第一次运行，正在安装依赖，可能要几分钟...
  call npm install --omit=dev --no-audit --no-fund
)

set "COREAD_HOST=127.0.0.1"
set "COREAD_PORT=3000"
set "COREAD_MCP_HOST=127.0.0.1"
set "COREAD_MCP_PORT=3001"

echo 启动网页服务 :3000 和 MCP 服务 :3001 ...
echo （这两个黑窗别关，关了就等于把服务停了）
start "coread 网页 :3000" /D "%~dp0" cmd /k ""%NODE%" server.mjs"
start "coread MCP  :3001" /D "%~dp0" cmd /k ""%NODE%" mcp-sse.mjs"

timeout /t 3 >nul
start "" http://localhost:3000
