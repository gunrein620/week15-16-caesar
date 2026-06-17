@echo off
REM 당일 식단 이미지 OCR -> MenuArchive 저장 (작업 스케줄러용 래퍼)
REM 이 .bat 위치(scripts) 기준으로 mcp-server 폴더로 이동해 실행한다.
cd /d "%~dp0..\apps\mcp-server"
call npx tsx src/sync-daily-menu.ts >> "%~dp0..\storage\sync-daily.log" 2>&1
