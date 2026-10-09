@echo off
REM ===========================================================================
REM Only for the Claude desktop app's preview feature.
REM You do NOT need this script in your own terminal.
REM
REM Why: inside the Claude container %APPDATA% is virtualized/redirected to
REM C:\WpSystem\..., and Next.js writes its global config
REM (%APPDATA%\nextjs-nodejs\Config\config.json) using a temp-file + atomic
REM rename, which fails across that redirect boundary with EXDEV, crashing
REM the dev server.
REM
REM Pointing APPDATA at a plain directory works around it. This only changes
REM where Next keeps its global config; the project itself is untouched.
REM
REM See shadow-narrative-docs/recon/environment.md section 6.1
REM
REM NOTE: keep this file ASCII-only. cmd.exe reads .cmd in the OEM codepage
REM (GBK on Chinese Windows), so UTF-8 comments get mis-parsed as commands.
REM ===========================================================================

REM Switch to the project root (this script lives in <root>\scripts\).
REM Required, otherwise npm looks for package.json in the wrong directory.
cd /d "%~dp0.."

set "APPDATA=%USERPROFILE%\.cache\appdata"
if not exist "%APPDATA%" mkdir "%APPDATA%"

call npm run dev
