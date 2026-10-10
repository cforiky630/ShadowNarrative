import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,

  /**
   * 独立产物。
   *
   * 用户 2026-10-10 要求「以后封装成独立 app 不能难」。Electron 封装的做法是
   * **把这个 standalone 服务器当子进程起，再开一个 BrowserWindow 指向它** ——
   * 所以这个产物能不能真的跑起来，就是封装难易的分水岭。现在就让它一直是绿的。
   *
   * 它是**增量**的：只是多产出 `.next/standalone/`，不影响 `next dev`
   * 与 `next start`，也让 `17 §5` 的自托管形态更干净。
   */
  output: "standalone",

  /**
   * 原生模块不能被打进 bundle —— 打进就意味着在构建机上编译一次二进制，
   * 用户机器上 ABI 一旦不匹配就 `ERR_DLOPEN_FAILED`。
   *
   * `better-sqlite3` 本来就在 Next 的自动排除名单里（server-external-packages.jsonc），
   * 这里写出来是为了让它**显式**，不然哪天名单变了没人知道。
   */
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],

  /**
   * 开发指示器挪到右下角。
   *
   * 它默认就在**左下角**，而设置那颗悬浮球（`SettingsPanel`，
   * 用户 2026-10-10 指定照 Next 那颗开发球做）也在那儿 —— 两个圆球
   * 叠在同一个角上，球点不到。生产环境没有指示器，所以这纯粹是
   * 开发期的冲突，但开发期正是要天天点它的时候。
   *
   * 不设 `false`：那个指示器标着当前路由是静态还是动态，有用。
   */
  devIndicators: {
    position: "bottom-right",
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
