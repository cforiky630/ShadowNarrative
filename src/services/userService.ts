import { prisma } from "@/lib/prisma";

/**
 * 用户与偏好设置。
 *
 * 规格：08 §1 硬约束 #1、08 §3（UserSettings）
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
  particlePreset: string;
  backupEndpoint: string | null;
  backupAuto: boolean;
}

/**
 * 读取用户设置，不存在时按默认值初始化（08-DATA_API_SPEC.md §3）。
 *
 * 采用 upsert 保证并发读写安全，避免并发请求时撞唯一约束。
 */
export async function getSettings(userId: string): Promise<UserSettingsView> {
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      particlePreset: true,
      backupEndpoint: true,
      backupAuto: true,
    },
  });

  return settings;
}
