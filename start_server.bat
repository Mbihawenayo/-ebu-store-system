@echo off
cd /d "C:\Users\EBUE\Documents\Management System"
start /b python -m http.server 8000
timeout /t 2 >nul
start http://localhost:8000/login.html
exit
