#!/usr/bin/env node
// 首次运行流程。
//
// 规格：17-SELF_HOSTING.md §5
//
// 目标只有一句话：让用户从 clone 到「打开就能用」不超过三步
// （clone → install → setup → start）。
//
// 数据目录的解析**复用 src/lib/dataDir.ts** —— Node 24 会直接 strip 掉类型。
// 刻意不在这里重写一份：两边推导不一致会让 migrate 写进一个库、应用读另一个库，
// 而且不会报错。

import { spawnSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveDataDir,
  resolveDatabasePath,
  resolvePhotosDir,
  resolveSecretsPath,
} from "../src/lib/dataDir.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** secrets.json 的模板。key 留空 —— 由设置页或手动填入（17 §4）。 */
const SECRETS_TEMPLATE = `{
  "aiApiKey": "",
  "aiBaseUrl": "https://api.deepseek.com",
  "aiModel": "deepseek-flash",
  "backupEndpoint": "",
  "backupToken": ""
}
`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function step(n, text) {
  console.log(`\n[${n}/5] ${text}`);
}

async function main() {
  console.log("Shadow Narrative — 首次运行");

  // --- 1. 解析数据目录 ---
  step(1, "解析数据目录");
  const dataDir = resolveDataDir();
  console.log(`      ${dataDir}`);

  // --- 2. 创建目录结构 ---
  step(2, "创建目录结构");
  await mkdir(resolvePhotosDir(), { recursive: true });
  console.log(`      ${resolvePhotosDir()}`);

  // --- 3. 跑迁移 ---
  step(3, "应用数据库迁移");
  // 传单个命令字符串而不是 args 数组：Node 24 起，同时传 args 与 shell:true
  // 会触发 DEP0190（参数不转义，只做拼接）。命令是写死的常量，不经用户输入。
  // Windows 上 npx 是 .cmd，必须走 shell 才找得到。
  const migrate = spawnSync("npx prisma migrate deploy", {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });

  if (migrate.status !== 0) {
    console.error("\n迁移失败。数据库位置：" + resolveDatabasePath());
    process.exit(migrate.status ?? 1);
  }

  // --- 4. 凭据模板 ---
  step(4, "本机凭据");
  const secretsPath = resolveSecretsPath();
  if (await exists(secretsPath)) {
    console.log("      secrets.json 已存在，保持不动");
  } else {
    // 0600：只有本用户可以读（17 §3）。Windows 上依赖用户目录的默认 ACL
    await writeFile(secretsPath, SECRETS_TEMPLATE, { mode: 0o600 });
    console.log(`      已生成模板 ${secretsPath}`);
    console.log("      AI key 留空 —— 到设置页填，或直接编辑这个文件");
  }

  // --- 5. 收尾 ---
  step(5, "完成");
  const host = process.env.SN_HOST ?? "127.0.0.1";
  const port = process.env.PORT ?? "3000";

  console.log(`
  数据目录    ${dataDir}
  数据库      ${resolveDatabasePath()}
  原图        ${resolvePhotosDir()}

  启动        npm run dev        （开发）
              npm start          （自托管运行）
  访问        http://${host}:${port}

  提醒：默认只监听 ${host}。改成 0.0.0.0 等于把整个照片库暴露在局域网上，
  而本产品没有任何鉴权（17 §6）。真要局域网访问，请自行承担风险。
`);
}

await main();
