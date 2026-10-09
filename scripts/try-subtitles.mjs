#!/usr/bin/env node
// 字幕样例生成器 —— 调提示词之后跑一遍，看实际输出。
//
// 语气这种东西没法靠读 prompt 判断，只能看输出。
//
// 用法：
//   node scripts/try-subtitles.mjs <图片...>        每张 6 条
//   N=3 node scripts/try-subtitles.mjs <图片...>    每张 3 条
//
// 关键：直接 import src/services/aiPrompt.ts —— 看到的就是**线上会说的**，
// 不是另写一份"调试用提示词"（那两份一定会各改各的）。
//
// 每次调用独立生成一条，和生产的调用方式一致。一次要 N 条会人为拉大差异，
// 看着好看但不代表实际表现。
//
// ⚠️ 会走真实 API 计费。

import { readFile } from "node:fs/promises";
import path from "node:path";

import { SYSTEM_PROMPT, USER_INSTRUCTION } from "../src/services/aiPrompt.ts";

const images = process.argv.slice(2);
if (images.length === 0) {
  console.error("用法：node scripts/try-subtitles.mjs <图片...>");
  process.exit(1);
}

const N = Number(process.env.N ?? 6);

const env = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const KEY = pick("AI_API_KEY");
const BASE = pick("AI_BASE_URL") ?? "https://api.deepseek.com";
const MODEL = pick("AI_MODEL") ?? "deepseek-flash";

if (!KEY) {
  console.error("AI_API_KEY 未配置（.env.local 或 secrets.json）");
  process.exit(1);
}

async function once(dataUrl) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            { type: "text", text: USER_INSTRUCTION },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      effort: "low",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length" || !choice?.message?.content) {
    throw new Error("回应不完整（max_tokens 被 reasoning 吃满？）");
  }

  const raw = choice.message.content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(raw).subtitle;
}

for (const imagePath of images) {
  const bytes = await readFile(imagePath);
  const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  console.log(`\n${"=".repeat(72)}\n${path.basename(imagePath)}\n${"=".repeat(72)}`);
  for (let i = 0; i < N; i += 1) {
    try {
      console.log(`\n  ${String(i + 1).padStart(2)}. ${await once(dataUrl)}`);
    } catch (error) {
      console.log(`\n  ${String(i + 1).padStart(2)}. (失败：${error.message})`);
    }
  }
}
