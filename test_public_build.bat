@echo off
setlocal
cd /d "%~dp0"

set "PYEXE=C:\Users\admin\AppData\Local\Programs\Python\Python312\python.exe"

if not exist "%PYEXE%" (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PYEXE=py"
  ) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
      set "PYEXE=python"
    ) else (
      echo Python was not found.
      pause
      exit /b 1
    )
  )
)

echo Starting public-deploy test server...

if "%PYEXE%"=="py" (
  start "3DGS Public Test Server" cmd /k py -m http.server 8080 --bind 127.0.0.1
) else if "%PYEXE%"=="python" (
  start "3DGS Public Test Server" cmd /k python -m http.server 8080 --bind 127.0.0.1
) else (
  start "3DGS Public Test Server" cmd /k ""%PYEXE%" -m http.server 8080 --bind 127.0.0.1"
)

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080/index.html?v=5.1.0"
pause
