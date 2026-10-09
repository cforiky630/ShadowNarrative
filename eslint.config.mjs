import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // 会话工作树。Claude 桌面应用会在 .claude/worktrees/<name>/ 下为每个会话
    // 建一份**完整的仓库副本**（含它自己的 .next 构建产物）。这里的忽略模式是
    // 相对配置文件、不递归的，所以根目录那条 ".next/**" 管不到副本里的 .next ——
    // 不忽略的话 lint 会走进别人的工作树，报出上万条与当前改动无关的错误。
    ".claude/worktrees/**",

    // 数据目录：运行时的用户数据，不是源码（17-SELF_HOSTING.md §3）
    ".data/**",
  ]),
]);

export default eslintConfig;
