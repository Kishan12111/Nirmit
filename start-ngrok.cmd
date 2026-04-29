@echo off
cd /d "%~dp0"
".tools\ngrok\ngrok.exe" http 3000 --config ".tools\ngrok\ngrok.yml" --log=stdout > "ngrok-task.log" 2>&1
