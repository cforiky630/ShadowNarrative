import { prisma } from "@/lib/prisma";

/**
 * 用户与偏好设置。
 *
 * 规格：08 §1 硬约束 #1、08 §3（UserSettings）、09 §21.2（autoAnalyze）
 *
 * ⚠️ `getLocalUserId()` 是**全应用唯一的用户解析点**。
 *
 * 现在它 upsert 一个固定的本地用户 —— 自托管阶段只有一个用户（17 §1）。
 * 将来接登录时，**只换这个函数体**（从会话里读），其余 service 与数据模型一律不动。
 *
 * 另一条同样重要：**userId 只能由服务端解析，绝不能从请求里读。**
 * 本产品没有鉴权（17 §6），客户端传来的 userId 不构成 ownership 校验（12 §4），
 * 那是越权。所有 API 路由都必须调用这里的函数，而不是解析 query / body。
 */

/** 单用户阶段的本地用户 id。接入登录后由会话提供。 */
export const LOCAL_USER_ID = "local";

export async function getLocalUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    create: { id: LOCAL_USER_ID, name: "Local" },
    update: {},
    select: { id: true },
  });
  return user.id;
}

export interface UserSettingsView {
  autoAnalyze: boolean;
  particlePreset: string;
  backupEndpoint: string | null;
  backupAuto: boolean;
}

/**
 * 读用户设置，没有就按默认值建一条。
 *
 * 用 upsert 而不是「先查再建」：并发请求下后者会撞唯一约束。
 */
export async function getSettings(userId: string): Promise<UserSettingsView> {
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      autoAnalyze: true,
      particlePreset: true,
      backupEndpoint: true,
      backupAuto: true,
    },
  });

  return settings;
}

/**
 * 上传后是否自动把照片发给模型（09 §21.2）。
 *
 * 这不是可有可无的开关 —— 在「不加密、照片会发给模型」的前提下，
 * 用户需要知道自己是什么时候把照片发出去的（12 §5）。
 */
export async function setAutoAnalyze(
  userId: string,
  autoAnalyze: boolean,
): Promise<void> {
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, autoAnalyze },
    update: { autoAnalyze },
  });
}
