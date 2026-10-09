import { Suspense } from "react";
import { connection } from "next/server";
import { SettingsForm } from "@/components/SettingsForm";
import { getAiPublicInfo } from "@/lib/secrets";
import { getLocalUserId, getSettings } from "@/services/userService";
import type { SettingsView } from "@/types";

/**
 * 设置。
 *
 * 规格：07-UI_PAGE_SPECS.md §11
 *
 * 这是产品里**唯一**一个普通页面。它不属于 `01-PRODUCT_SPEC.md` §5 的 7 个体验
 * 状态 —— 配置不是记忆，用户离开体验去改配置本来就是有意识的行为，
 * 所以「不能让人感觉是切换页面」（`16 §8.6`）不适用于它。
 *
 * 与首页同样的理由用 connection() + <Suspense>：
 *   cacheComponents 开着，内容来自数据库与磁盘，一旦被预渲染就会固化成构建时快照。
 */
export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <SettingsLoader />
    </Suspense>
  );
}

async function SettingsLoader() {
  await connection();

  const userId = await getLocalUserId();
  // 一个读数据库、一个读磁盘，并行取
  const [settings, ai] = await Promise.all([
    getSettings(userId),
    getAiPublicInfo(),
  ]);

  const initial: SettingsView = {
    autoAnalyze: settings.autoAnalyze,
    aiKeyConfigured: ai.configured,
    aiKeyFromEnv: ai.fromEnv,
    aiBaseUrl: ai.baseUrl,
    aiModel: ai.model,
  };

  return <SettingsForm initial={initial} />;
}
