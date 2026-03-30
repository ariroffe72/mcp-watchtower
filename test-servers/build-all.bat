@echo off
setlocal enabledelayedexpansion

set SERVERS=clean-mcp bad-names-mcp mixed-conventions-mcp param-conflicts-mcp shadow-mcp too-many-tools-mcp kitchen-sink-mcp finance-mcp market-mcp

echo Building all test servers...
for %%s in (%SERVERS%) do (
  echo   Building %%s...
  cd %%s
  call npm install --silent
  call npm run build --silent
  cd ..
)
echo All test servers built successfully.
