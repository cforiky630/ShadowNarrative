/**
 * Shadow Narrative 组件库总出口
 *
 * 空间级页面 (Spaces):
 *   - AlbumSpace         首屏画廊
 *   - MemorySpace        照片粒子视界
 *   - TimelineSpace      中央时间线
 *   - MemoriesSpace      影册架子
 *   - MemoryAlbum        影册单册详情
 *
 * 外壳与常驻骨架 (Shell & Layout):
 *   - ExperienceShell    体验外壳 (持有单例画布与 FLIP 路由接缝)
 *   - TopNavigation      顶部导航
 *   - BottomDock         左下角自适应状态胶囊
 *   - DockCard           浮卡容器
 *   - DebugOverlay       渲染监控层
 *
 * 交互浮层与面板 (Overlays & Panels):
 *   - PhotoOverlay       全屏实时模糊遮罩 (承载对话与随笔小记)
 *   - ConversationPanel  AI 对话流面板
 *   - NotePanel          随笔小记面板
 *   - SettingsPanel      设置面板
 *   - SettingsForm       设置表单
 *   - OrganizePanel      照片入册多选面板
 *
 * 画布与粒子 (Canvas & Particles):
 *   - ParticleCanvas     WebGL 粒子画布
 *   - ParticleControls   粒子参数调试板
 *
 * 原子 UI 与微组件 (UI Primitives):
 *   - AccordionGallery   手风琴画廊
 *   - PhotoCell          照片网格卡片
 *   - PhotoDate          拍摄时间日历微组件
 *   - PhotoPicker        捉影上传触发器
 *   - Subtitle           AI 字幕与交互引线
 *   - HoldButton         物理长按确认按钮
 */

// Spaces
export { AlbumSpace } from "./AlbumSpace";
export { MemorySpace } from "./MemorySpace";
export { TimelineSpace } from "./TimelineSpace";
export { MemoriesSpace } from "./MemoriesSpace";
export { MemoryAlbum } from "./MemoryAlbum";

// Shell & Layout
export { ExperienceShell, useStage } from "./ExperienceShell";
export { TopNavigation } from "./TopNavigation";
export { BottomDock } from "./BottomDock";
export { DockCard } from "./DockCard";
export { DebugOverlay } from "./DebugOverlay";

// Overlays & Panels
export { PhotoOverlay } from "./PhotoOverlay";
export { ConversationPanel } from "./ConversationPanel";
export { NotePanel } from "./NotePanel";
export { SettingsPanel } from "./SettingsPanel";
export { SettingsForm } from "./SettingsForm";
export { OrganizePanel } from "./OrganizePanel";

// Canvas & Particles
export { ParticleCanvas } from "./ParticleCanvas";
export { ParticleControls } from "./ParticleControls";

// UI Primitives
export { default as AccordionGallery } from "./AccordionGallery";
export { PhotoCell } from "./PhotoCell";
export { PhotoDate } from "./PhotoDate";
export { PhotoPicker } from "./PhotoPicker";
export { Subtitle } from "./Subtitle";
export { default as HoldButton } from "./HoldButton";
