@echo off
echo Installing dependencies...
pip install -r requirements.txt

echo Starting backend server...
python main.py
pause
