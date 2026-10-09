# Shadow Narrative — Reference Components & Design Resources

## 1. 原则

外部资源只用于：

- 研究
- 参考
- 复用基础能力
- 二次开发

不允许把多个组件库直接拼成一个模板网站。

## 2. React Bits

参考方向：

- Pixel Transition
- Pixel Swap
- Ripple Distortion
- Image Trail
- Magnet
- Swarm Cursor
- Glow Cursor
- Gradual Blur
- Ribbons
- Strands
- Scroll Expand
- Noise

官方入口：

https://reactbits.dev/

适合：

- 光标
- 微交互
- 图片扰动
- 页面微动画
- Hover
- 视觉辅助

核心 Particle Engine 不依赖 React Bits。

## 3. Aceternity UI

参考方向：

- Pixelated Canvas
- Lens
- Background Ripple
- Dither Shader
- Noise Background
- Floating Dock
- Magnetic Button
- Glowing Effect
- Resizable Navbar
- Card Spotlight

官方入口：

https://ui.aceternity.com/

用途：

高级 UI 能力、图片互动和轻量 shader 参考。

不要照搬 Aceternity 的默认营销网站风格。

## 4. Magic UI

参考方向：

- Floating 3D Particles
- Pixel Image
- Particles
- Lens
- Ripple
- Noise Texture
- Smooth Cursor
- Morphing Text

官方入口：

https://magicui.design/

## 5. shadcn/ui

用于基础 primitive：

- Dialog
- Drawer
- Sheet
- Slider
- Switch
- Tabs
- Input
- Textarea
- Tooltip
- Command
- ScrollArea
- Popover

官方入口：

https://ui.shadcn.com/

必须重做为 Shadow Narrative 设计语言。

## 6. Motion for React

官方入口：

https://motion.dev/docs/react

适合：

- enter/exit
- layout
- shared layout
- scroll
- gesture
- spring
- drawer
- text motion
- micro-interaction

不要让 Motion 承担大量 WebGL 粒子。

## 7. Three.js Examples

官方入口：

https://threejs.org/examples/

重点研究：

- buffergeometry points
- custom attributes
- instancing
- rawshader
- worker / offscreen canvas
- performance
- GPGPU / compute 相关示例

## 8. React Three Fiber

用于 React + Three.js 的场景管理。

重点研究：

- camera
- effects
- scroll
- postprocessing
- scene state
- performance

## 9. Codrops

官方入口：

https://tympanus.net/codrops/

重点研究：

- WebGL
- image distortion
- cursor
- particle
- scroll storytelling
- creative transition
- shader

只学习 interaction language，不复制页面。

## 10. Godly

用于研究真实网站的：

- Layout
- Typography
- Navigation
- Storytelling
- Motion
- Information hierarchy

它是设计参照，不是模板来源。

## 11. 资源选择决策

如果已有组件无法达到视觉目标：

1. 改造组件
2. 自己重写
3. 必要时直接实现

核心体验不能受制于组件库。

## 12. 版权/资产原则

- 不复制第三方网站的品牌、Logo、专有文案和图片。
- 用户自己的图片可以作为视觉源。
- 没有真实照片时使用原创或无版权测试素材。
- 不把第三方 demo 作为最终产品资产。
