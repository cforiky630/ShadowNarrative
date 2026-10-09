@echo off
REM ---------------------------------------------------------------------------
REM 仅供 Claude 桌面应用的预览功能使用。你自己的终端不需要这个脚本。
REM
REM 背景：在 Claude 容器内，%APPDATA% 被虚拟化重定向到 C:\WpSystem\...，
REM Next.js 写全局配置（%APPDATA%\nextjs-nodejs\Config\config.json）时用的
REM 是「临时文件 + 原子 rename」，跨重定向边界会失败并报 EXDEV，dev server 崩溃。
REM
REM 把 APPDATA 指向一个普通目录即可绕开。这只影响 Next 的全局配置位置，
REM 不影响项目本身。
REM
REM 详见 shadow-narrative-docs/recon/environment.md §6.1
REM ---------------------------------------------------------------------------

set "APPDATA=%USERPROFILE%\.cache\appdata"
if not exist "%APPDATA%" mkdir "%APPDATA%"

call npm run dev
