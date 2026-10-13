import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { MemoryAlbum } from "@/components/MemoryAlbum";
import { getMemory } from "@/services/memoryService";
import { getLocalUserId } from "@/services/userService";

/**
 * 一册 —— `/memories/<id>`（`07 §12`）。
 *
 * ⚠️ **仍然显式 `connection()`**，虽然动态段 `[id]` 本身就是请求数据、
 * 这条路由本来就不会被预渲染。理由是与 `/timeline` 保持同一种写法 ——
 * 留一个「为什么这条不用」的问题，下次有人加一条没有动态段的路由时
 * 就会照着错的那条抄。
 *
 * 找不到这一册 → `notFound()`。与照片页那条「回落相册」不同：
 * 地址栏上那册不存在时没有一个说得通的默认落点，而 404 说得很清楚。
 * 别人（或一个手写的 URL）的一册 id 也走这条 —— 查询条件里带着 userId，
 * `getMemory` 返回 null，同样 404（`08 §5` 不区分，不泄露它存不存在）。
 */

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * ⚠️ **这条路由允许「进去的时候是空的」。**
 *
 * 这是**第一条动态段路由**（`/memories/<id>`），一出现它，Next 的
 * instant-navigation 校验就会报 `CLIENT_HOOK_DYNAMIC`：
 * `TopNavigation` 与 `ExperienceShell` 里有 `usePathname()`，而它们在 layout
 * 里、在页面的 `<Suspense>` 之外 —— 预渲染静态外壳时那个值还不在。
 *
 * 两种修法（框架的错误信息里就写着这两条）：
 *
 * - **把它包进 `<Suspense>`** —— 那就得改根 layout，让顶栏流式补进来，
 *   而顶栏是 `fixed` 的一行字，闪一下比等它更难看
 * - **`instant = false`** —— 声明「进这一条路由是允许阻塞的」
 *
 * 取后者，因为它说的是实话：这一页的内容**整个**来自数据库（相册名与
 * 里面的照片），没有哪一部分能先画出来 —— 与它上面那句 `connection()`
 * 是同一件事的两面（那句是「别预渲染」，这句是「别指望进去就看见东西」）。
 *
 * ⚠️ `instant` 只在开了 `cacheComponents` 时有效，**且只在开发期按 warning
 * 级别校验，构建不受影响**（`next/dist/docs/.../route-segment-config/instant.md`）。
 * 写在这里是为了让那条警告有个交代，不是因为它会拦住构建。
 */
export const instant = false;

export default function Page({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <AlbumLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AlbumLoader({ params, searchParams }: PageProps) {
  await connection();

  const [{ id }, query, userId] = await Promise.all([
    params,
    searchParams,
    getLocalUserId(),
  ]);

  const album = await getMemory(userId, id);
  if (!album) notFound();

  /*
   * `?organize=1` —— 架子上刚新建完一册就带着它过来（见 `MemoriesSpace`），
   * 落地时把整理照片那张面板直接打开。刚建完的一册是空的，停在一个空册上
   * 等于多问一句「然后呢」。
   */
  const organize = query.organize;

  return <MemoryAlbum album={album} openOrganize={organize === "1"} />;
}
