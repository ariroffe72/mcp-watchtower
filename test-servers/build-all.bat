@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set SKIP_PYTHON=0
set SKIP_GO=0

for %%a in (%*) do (
  if "%%a"=="--skip-python" set SKIP_PYTHON=1
  if "%%a"=="--skip-go"     set SKIP_GO=1
)

:: Prerequisite checks
if %SKIP_PYTHON%==0 (
  where uv >nul 2>&1
  if errorlevel 1 (
    echo ERROR: uv is not installed. Install it from https://docs.astral.sh/uv/ or pass --skip-python.
    exit /b 1
  )
)

if %SKIP_GO%==0 (
  where go >nul 2>&1
  if errorlevel 1 (
    echo ERROR: go is not installed. Install it from https://go.dev/dl/ or pass --skip-go.
    exit /b 1
  )
)

echo Building all test servers...
echo.

:: ── TypeScript servers ──────────────────────────────────────────────────────
echo TypeScript servers:
for %%s in (clean-mcp bad-names-mcp mixed-conventions-mcp kitchen-sink-mcp market-mcp) do (
  echo   Building %%s...
  cd "%ROOT%%%s"
  call npm install --silent
  call npm run build --silent
  cd "%ROOT%"
)

:: ── Python servers ──────────────────────────────────────────────────────────
echo.
if %SKIP_PYTHON%==1 (
  echo Python servers: skipped (--skip-python^)
) else (
  echo Python servers:
  for %%s in (param-conflicts-mcp shadow-mcp too-many-tools-mcp) do (
    echo   Syncing %%s...
    cd "%ROOT%%%s"
    call uv sync --quiet
    cd "%ROOT%"
  )
)

:: ── Go servers ──────────────────────────────────────────────────────────────
echo.
if %SKIP_GO%==1 (
  echo Go servers: skipped (--skip-go^)
) else (
  echo Go servers:
  echo   Building finance-mcp...
  cd "%ROOT%finance-mcp"
  go build -o finance-mcp.exe .
  cd "%ROOT%"
)

echo.
echo All test servers built successfully.
