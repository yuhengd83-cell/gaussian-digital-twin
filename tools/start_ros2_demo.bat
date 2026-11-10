@echo off
setlocal
cd /d "%~dp0.."
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 tools\ros2_receiver_bridge.py --demo
) else (
  python tools\ros2_receiver_bridge.py --demo
)
pause
