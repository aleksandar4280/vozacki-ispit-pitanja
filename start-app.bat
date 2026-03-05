@echo off
cd /d D:\vozacki-ispit-pitanja
timeout /t 10 /nobreak
call pm2 delete vozacki-ispit-pitanja
call pm2 start node_modules/next/dist/bin/next --name vozacki-ispit-pitanja -- start
exit