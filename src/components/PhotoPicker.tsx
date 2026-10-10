"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * 「点一下打开文件选择」的入口。
 *
 * 这里只管**行为**，不管文案 —— 标签由调用方给。
 * 有照片的界面上（照片页左下角、相册操作行）它写**「捉影」**，那是用户
 * 定的产品语言（同 `Into this moment` 一路：把技术动作说成一件关于影的事）；
 * 空态里写长一点的说法，因为那里的人是第一次用。
 *
 * 抽出来是因为**它有一个必须记住的坑**，而要用它的地方现在有四处
 * （相册空态、相册操作行、时间线空态、照片页左下角）：
 *
 * > `<input type="file">` 选完**同一个文件**不会再触发 `change` ——
 * > 必须在处理完把 `e.target.value` 清空，否则用户第二次选同一张毫无反应。
 * > 写四遍就会漏三遍。
 *
 * ── 为什么是 `<label>` 不是 `inputRef.current.click()` ──────────────
 *
 * `<label>` 包着 input 是浏览器原生支持的：点标签就是点 input，不用自己接
 * 点击。`input.click()` 那条路要自己加 `tabIndex`、`role`、键盘处理。
 *
 * ⚠️ **input 用 `sr-only` 不能用 `hidden`。** `hidden` 是 `display: none`，
 * 而**不可渲染的元素不可聚焦** —— 键盘用户 Tab 不到它，等于这个入口对键盘
 * 不存在（`16 §12`：全部操作必须可用键盘完成）。`sr-only` 把它留在布局里
 * （1×1 + 裁剪），于是它能被 Tab 到、Enter/Space 能开选择器、读屏器也认它
 * 是「文件上传」按钮。
 *
 * 代价是焦点环落在那个看不见的 input 上 —— 所以标签自己挂
 * `focus-within:opacity-85`，用**提亮**把「焦点在这儿」说出来
 * （这套配色里表达注意的方式一贯是提亮，不是描边）。
 * `relative` 是给 `sr-only` 的绝对定位一个参照，免得它跑到页面角落去。
 *
 * ⚠️ **调用方传的暗，必须用 `opacity-*` 而不是 `text-text-primary/xx`。**
 * 后者是**颜色的 alpha**，元素的 `opacity` 仍然是 1 —— 于是
 * `hover:opacity-85` / `focus-within:opacity-85` 全是**反的**（把字压得更暗）。
 * 这个坑在代码库里还有几处（见 `HANDOFF` 里那条待办），至少别在新写的
 * 地方再长一遍。
 *
 * `accept="image/*"` 只是**选择器的默认过滤**，不是校验 —— 真正的校验
 * 在服务端（`mediaService` 的五道，`08 §12`）。这里放宽是为了让用户能选到
 * 带奇怪扩展名的图，由服务端去拒。
 */
export function PhotoPicker({
  onFile,
  className,
  style,
  children,
}: {
  /** 选好了。调用方负责上传与失败提示 */
  onFile: (file: File) => void;
  className?: string;
  /** 给 hover 过渡用 —— 项目的缓动是 CSS 变量，Tailwind 类里没有对应项 */
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <label
      className={`relative ${className ?? ""} focus-within:opacity-85`}
      style={style}
    >
      {children}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // ⚠️ 必须清空，否则同一张选第二次不会触发 change ——
          // 见文件头
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
