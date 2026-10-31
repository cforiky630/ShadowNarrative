"use client";

import { useEffect, useState } from "react";

/**
 * 整页拖入照片 Hook。
 *
 * ⚠️ 监听挂在 window 上，不能挂在页面元素上。
 * 照片页的 <main> 是 pointer-events: none 的（指针要穿透到画布，
 * 否则拖拽旋转失效），命中测试根本落不到它身上。
 *
 * 拖拽事件会冒泡到 window，所以在这里接一次就够。
 * 返回「现在有没有文件悬在页面上」，给高亮框用。
 */
export function usePhotoDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onOver = (e: DragEvent) => {
      // 只认文件。拖着选中的文字晃过页面不该触发上传提示
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };

    const onLeave = (e: DragEvent) => {
      // dragleave 在子元素之间也会触发；relatedTarget 为空才是真的离开了窗口
      if (!e.relatedTarget) setDragging(false);
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    };

    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFile]);

  return dragging;
}
