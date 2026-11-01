#!/usr/bin/env node
/**
 * Shadow Narrative — 桌面应用自动化封装脚本
 *
 * 规范参考：
 * - docs/specs/10-IMPLEMENTATION_PLAN.md (Round 13)
 * - docs/specs/17-SELF_HOSTING.md
 *
 * 用法：
 * - npm run build:desktop                           完整执行 Next 构建 + 封装 NSIS 安装包与便携 ZIP
 * - npm run build:desktop -- --out D:\CustomDir     指定自定义输出目录（支持 -o / --out / --out=...）
 * - npm run build:desktop:fast -- -o D:\CustomDir   快速免压缩验证并输出到指定目录
 * - node scripts/package-desktop.mjs --skip-build   复用已有 .next/standalone 快速封装
 * - node scripts/package-desktop.mjs --unpacked     仅生成免压缩的 win-unpacked 目录（秒级验证）
 *
 * 输出（默认）：
 * - F:\Project\shadow-narrative-desktop
 *   ├── Shadow Narrative-Setup-<version>.exe (NSIS 安装版，支持自定义路径与完整卸载)
 *   └── Shadow Narrative-<version>-win-x64.zip (免安装便携版，解压即用，数据默认存于同级 data/)
 */

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const skipBuild = args.has("--skip-build");
const unpackedOnly = args.has("--unpacked");

function resolveOutputDir(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" || arg === "-o" || arg === "--output") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        console.error(`错误: 参数 ${arg} 需要提供目标输出路径。`);
        process.exit(1);
      }
      return path.resolve(process.cwd(), next);
    }
    if (arg.startsWith("--out=") || arg.startsWith("--output=")) {
      const val = arg.slice(arg.indexOf("=") + 1).trim();
      if (!val) {
        console.error(`错误: 参数 ${arg} 需要提供目标输出路径。`);
        process.exit(1);
      }
      return path.resolve(process.cwd(), val);
    }
  }
  if (process.env.SN_DESKTOP_OUT) {
    return path.resolve(process.cwd(), process.env.SN_DESKTOP_OUT);
  }
  return path.resolve(projectRoot, "..", "shadow-narrative-desktop");
}

const outputDir = resolveOutputDir(rawArgs);
if (outputDir === projectRoot) {
  console.error("错误: 输出目录不能为项目源码根目录本身。");
  process.exit(1);
}
const stagingDir = path.join(os.tmpdir(), `sn-desktop-staging-${Date.now()}`);

const pkg = JSON.parse(
  readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const version = pkg.version || "0.1.0";

console.log(`\n======================================================`);
console.log(`Shadow Narrative 桌面端打包 — 版本 v${version}`);
console.log(`目标输出目录: ${outputDir}`);
console.log(`临时中转目录: ${stagingDir}`);
console.log(`======================================================\n`);

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function resolveElectronBuilderCmd() {
  const candidates = [
    path.join(projectRoot, "node_modules", ".bin", "electron-builder.cmd"),
    path.join(
      process.env.LOCALAPPDATA || "C:\\Users\\Administrator\\AppData\\Local",
      "electron-builder-tool",
      "node_modules",
      ".bin",
      "electron-builder.cmd",
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return `"${c}"`;
  }
  return "npx --yes electron-builder";
}

async function main() {
  // 1. 清理旧产物与准备输出目录（仅移除本应用的打包产物，避免误删用户指定目录中的其他文件）
  log("1/7", "准备输出目录并清理历史构建产物...");
  if (existsSync(outputDir)) {
    const stalePattern =
      /^(win-unpacked|builder-.*\.(yml|yaml)|latest\.yml|Shadow Narrative[- ].*\.(exe|zip|blockmap))$/i;
    for (const entry of readdirSync(outputDir)) {
      if (stalePattern.test(entry)) {
        rmSync(path.join(outputDir, entry), { recursive: true, force: true });
      }
    }
  } else {
    mkdirSync(outputDir, { recursive: true });
  }

  // 2. 构建最新 Next.js Standalone 产物（除非显式传 --skip-build）
  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  if (!skipBuild || !existsSync(standaloneDir)) {
    log("2/7", "执行 npm run build 生成最新 Standalone 产物...");
    execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });
  } else {
    log("2/7", "已指定 --skip-build，复用现有 .next/standalone 产物...");
  }

  // 3. 创建中转临时工作区并解引用复制 standalone（消除 Turbopack 绝对路径 Junction 软链）
  log("3/7", "组装桌面运行环境与资源结构（含解引用外部原生模块）...");
  mkdirSync(stagingDir, { recursive: true });
  mkdirSync(path.join(stagingDir, "bin"), { recursive: true });
  mkdirSync(path.join(stagingDir, "template-db"), { recursive: true });

  // 复制独立的 node.exe 运行时（保证与 better-sqlite3 原生模块 ABI 100% 一致）
  const nodeSrc = process.execPath;
  const nodeDest = path.join(stagingDir, "bin", "node.exe");
  log("3/7", `复制 Node.js 运行时 (${nodeSrc}) 到包内...`);
  cpSync(nodeSrc, nodeDest);

  const stagedStandalone = path.join(stagingDir, "standalone");
  log("3/7", "复制 standalone 产物并将符号链接/Junction 实体化...");
  cpSync(standaloneDir, stagedStandalone, {
    recursive: true,
    dereference: true,
  });

  // 补全静态文件（Next standalone 默认不复制 .next/static 与 public）
  const sourceStatic = path.join(projectRoot, ".next", "static");
  const targetStatic = path.join(stagedStandalone, ".next", "static");
  if (existsSync(sourceStatic)) {
    cpSync(sourceStatic, targetStatic, { recursive: true, dereference: true });
  }
  const sourcePublic = path.join(projectRoot, "public");
  const targetPublic = path.join(stagedStandalone, "public");
  if (existsSync(sourcePublic)) {
    cpSync(sourcePublic, targetPublic, { recursive: true, dereference: true });
  }

  // 剔除可能带入中转目录的本地开发环境变量文件或开发数据库，严防开发机密钥/照片外泄
  for (const name of readdirSync(stagedStandalone)) {
    if (name.startsWith(".env") || name === ".data") {
      rmSync(path.join(stagedStandalone, name), {
        recursive: true,
        force: true,
      });
    }
  }

  // 4. 在独立空目录执行 Prisma 迁移，生成 100% 干净无脏数据的 SQLite 模板数据库
  log("4/7", "通过 prisma migrate deploy 生成全新空白 SQLite 模板数据库...");
  const templateDbDir = path.join(stagingDir, "template-db");
  execSync("npx prisma migrate deploy", {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      SN_DATA_DIR: templateDbDir,
    },
  });
  // 清理迁移可能附带生成的 -wal / -shm 临时文件，只留纯净的 shadow-narrative.db
  for (const f of readdirSync(templateDbDir)) {
    if (f !== "shadow-narrative.db") {
      rmSync(path.join(templateDbDir, f), { recursive: true, force: true });
    }
  }

  // 5. 生成桌面主进程 main.js 与安全桥接 preload.js
  log("5/7", "生成 Electron 无边框启动器 main.js 与 preload.js...");
  const preloadScript = `const { contextBridge, ipcRenderer } = require('electron');

const desktopApi = {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('sn-window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('sn-window:toggle-maximize'),
  close: () => ipcRenderer.invoke('sn-window:close'),
  isMaximized: () => ipcRenderer.invoke('sn-window:is-maximized'),
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('sn-window:maximized-change', listener);
    return () => ipcRenderer.removeListener('sn-window:maximized-change', listener);
  }
};

contextBridge.exposeInMainWorld('snDesktop', desktopApi);
contextBridge.exposeInMainWorld('electronAPI', desktopApi);
`;

  writeFileSync(path.join(stagingDir, "preload.js"), preloadScript, "utf8");

  const mainScript = `const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let serverProcess = null;
let lastServerOutput = [];

ipcMain.handle('sn-window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.handle('sn-window:toggle-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});

ipcMain.handle('sn-window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle('sn-window:is-maximized', () => {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
});

// 单实例锁：防止多开导致 SQLite 文件锁冲突或端口争抢
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 动态分配可用回环端口
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// 轮询服务就绪状态
function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get('http://127.0.0.1:' + port + '/', () => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          const detail = lastServerOutput.slice(-10).join('\\n');
          reject(new Error('服务端启动超时 (' + timeoutMs + 'ms)' + (detail ? '\\n\\n服务端日志：\\n' + detail : '')));
        } else {
          setTimeout(check, 150);
        }
      });
      req.setTimeout(800, () => {
        req.destroy();
        setTimeout(check, 150);
      });
    };
    check();
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {}
}

async function startApp() {
  const isPackaged = app.isPackaged;
  const resourcesDir = isPackaged ? process.resourcesPath : __dirname;
  const standaloneDir = path.join(resourcesDir, 'standalone');
  const serverScript = path.join(standaloneDir, 'server.js');
  const nodeBin = path.join(resourcesDir, 'bin', 'node.exe');
  const templateDb = path.join(resourcesDir, 'template-db', 'shadow-narrative.db');

  // 区分 NSIS 安装版与 ZIP 便携版：
  // - NSIS 安装版目录下存在 "Uninstall Shadow Narrative.exe"，数据默认存于系统 userData，升级不丢数据；
  // - ZIP 免安装便携版无卸载程序（或用户手动创建了同级 data 目录），数据直接存于 exe 同级 data/ 目录。
  const exeDir = path.dirname(app.getPath('exe'));
  const portableDataDir = path.join(exeDir, 'data');
  const hasUninstaller = fs.existsSync(path.join(exeDir, 'Uninstall Shadow Narrative.exe'));
  const usePortable = fs.existsSync(portableDataDir) || (isPackaged && !hasUninstaller);

  const dataDir = process.env.SN_DATA_DIR || (usePortable ? portableDataDir : path.join(app.getPath('userData'), 'data'));
  const photosDir = path.join(dataDir, 'photos');
  const dbFile = path.join(dataDir, 'shadow-narrative.db');
  const secretsFile = path.join(dataDir, 'secrets.json');
  const logFile = path.join(dataDir, 'server.log');

  fs.mkdirSync(photosDir, { recursive: true });

  // 首次运行：自动释放干净的模板数据库
  if (!fs.existsSync(dbFile) && fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, dbFile);
  }

  // 首次运行：自动创建 secrets.json 模板
  if (!fs.existsSync(secretsFile)) {
    const secretsTemplate = JSON.stringify({
      aiApiKey: '',
      aiBaseUrl: 'https://api.deepseek.com',
      aiModel: 'deepseek-flash',
      backupEndpoint: '',
      backupToken: ''
    }, null, 2);
    fs.writeFileSync(secretsFile, secretsTemplate, 'utf8');
  }

  const port = await getFreePort();
  const env = Object.assign({}, process.env, {
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    SN_DATA_DIR: dataDir
  });

  serverProcess = spawn(nodeBin, [serverScript], {
    cwd: standaloneDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  serverProcess.stdout.on('data', (chunk) => {
    const str = chunk.toString();
    lastServerOutput.push(str.trim());
    if (lastServerOutput.length > 50) lastServerOutput.shift();
    logStream.write(chunk);
  });
  serverProcess.stderr.on('data', (chunk) => {
    const str = chunk.toString();
    lastServerOutput.push(str.trim());
    if (lastServerOutput.length > 50) lastServerOutput.shift();
    logStream.write(chunk);
  });

  try {
    await waitForServer(port);
  } catch (err) {
    dialog.showErrorBox('启动错误', '内置服务未能正常启动：' + err.message);
    if (serverProcess) {
      killProcessTree(serverProcess.pid);
      serverProcess = null;
    }
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#050505',
    autoHideMenuBar: true,
    title: 'Shadow Narrative',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sn-window:maximized-change', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sn-window:maximized-change', false);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  // 外部链接交由系统默认浏览器打开，不在应用内弹出原生白窗
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      if (!url.startsWith('http://127.0.0.1:' + port)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  mainWindow.loadURL('http://127.0.0.1:' + port);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(startApp);

app.on('before-quit', () => {
  if (serverProcess) {
    killProcessTree(serverProcess.pid);
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    killProcessTree(serverProcess.pid);
    serverProcess = null;
  }
  app.quit();
});
`;

  writeFileSync(path.join(stagingDir, "main.js"), mainScript, "utf8");

  // 使用 extraResources 携带 standalone、bin 与 template-db，避免 electron-builder 过滤 node_modules
  const stagingPkg = {
    name: "shadow-narrative",
    productName: "Shadow Narrative",
    version: version,
    description: "Shadow Narrative - 私有沉浸式数字记忆产品",
    main: "main.js",
    author: "Shadow Narrative",
    build: {
      appId: "com.shadownarrative.desktop",
      productName: "Shadow Narrative",
      electronVersion: "34.0.0",
      directories: {
        output: outputDir,
        app: stagingDir,
      },
      files: ["main.js", "preload.js", "package.json"],
      extraResources: [
        {
          from: "standalone",
          to: "standalone",
        },
        {
          from: "bin",
          to: "bin",
        },
        {
          from: "template-db",
          to: "template-db",
        },
      ],
      win: {
        target: unpackedOnly
          ? [{ target: "dir", arch: ["x64"] }]
          : [
              {
                target: "nsis",
                arch: ["x64"],
              },
              {
                target: "zip",
                arch: ["x64"],
              },
            ],
        artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: "Shadow Narrative",
        uninstallDisplayName: "Shadow Narrative",
        runAfterFinish: true,
        artifactName: "${productName}-Setup-${version}.${ext}",
      },
    },
  };

  writeFileSync(
    path.join(stagingDir, "package.json"),
    JSON.stringify(stagingPkg, null, 2),
    "utf8",
  );

  // 6. 执行 electron-builder 封装打包
  const builderCmdBase = resolveElectronBuilderCmd();
  const targetFlags = unpackedOnly ? "--win dir" : "--win nsis zip";
  log(
    "6/7",
    `开始执行 electron-builder (${targetFlags})...`,
  );

  execSync(`${builderCmdBase} ${targetFlags}`, {
    cwd: stagingDir,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
      ELECTRON_BUILDER_BINARIES_MIRROR:
        "https://npmmirror.com/mirrors/electron-builder-binaries/",
    },
  });

  // 7. 清理中转临时工作区（保证原项目仓库与输出目录整洁干净）
  log("7/7", "清理中转临时文件与解压缓存...");
  try {
    rmSync(stagingDir, { recursive: true, force: true });
    if (!unpackedOnly) {
      const unpackedDir = path.join(outputDir, "win-unpacked");
      if (existsSync(unpackedDir)) {
        rmSync(unpackedDir, { recursive: true, force: true });
      }
    }
    const debugYml = path.join(outputDir, "builder-debug.yml");
    if (existsSync(debugYml)) {
      rmSync(debugYml, { force: true });
    }
  } catch (e) {
    console.warn("清理提示:", e.message);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 桌面封装完成！已输出至：${outputDir}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("封装过程发生错误:", err);
  process.exit(1);
});
