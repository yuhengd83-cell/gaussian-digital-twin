@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
    py -3 tools\serve_epoch30_v5584.py
) else (
    where python >nul 2>&1
    if not %errorlevel%==0 (
        echo Python 3 is required.
        pause
        exit /b 1
    )
    python tools\serve_epoch30_v5584.py
)
echo.
echo Check the output above if the viewer did not start.
pause
