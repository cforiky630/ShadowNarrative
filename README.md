# Shadow Narrative

个人记忆产品 —— 把照片、粒子、时间与故事融合在一个黑色沉浸式空间里。

## 特性

- 🎨 **粒子渲染引擎** - 基于 WebGL 的实时粒子系统，将照片转化为数十万个动态粒子
- 📸 **多维度记忆空间** - 相册、时间线、影册三种视角组织照片
- 🤖 **AI 理解** - 自动分析照片内容，生成描述与对话
- 📝 **随笔小记** - 为照片写下轻量的文字记录
- ⚡ **自适应性能** - 5 档性能配置，从集显到独显自动适配
- 🎯 **沉浸体验** - 无干扰的黑色界面，粒子与照片原图无缝切换

## 技术栈

- **前端框架**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **3D 渲染**: Three.js + postprocessing
- **动画**: GSAP + Motion
- **数据库**: Prisma 7 + SQLite
- **状态管理**: Zustand
- **样式**: Tailwind CSS 4

## 快速开始

### 前置要求

- Node.js 18+
- npm 或其他包管理器

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd shadow-narrative

# 安装依赖
npm install

# 初始化数据库
npm run db:migrate
```

### 开发

```bash
# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 构建

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 生产构建
npm run build

# 启动生产服务器
npm run start
```

构建产物在 `.next/standalone/` 目录，可直接用于部署或 Electron 封装。

## 项目结构

```
shadow-narrative/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (experience)/ # 体验路由组（相册/照片/时间线/影册）
│   │   └── api/          # RESTful API 路由
│   ├── components/       # UI 组件
│   ├── engine/           # 粒子渲染引擎
│   ├── services/         # 领域服务层
│   ├── lib/              # 工具函数与 hooks
│   ├── store/            # Zustand 全局状态
│   └── types/            # TypeScript 类型定义
├── prisma/
│   ├── schema.prisma     # 数据库 schema
│   └── migrations/       # 数据库迁移
├── public/               # 静态资源
└── shadow-narrative-docs/ # 完整的产品与技术规格文档
```

## 数据存储

应用数据存储在本地：

- **数据库**: `.data/shadow-narrative.db` (SQLite)
- **照片原图**: `.data/photos/`
- **缩略图**: `.data/photos/` (与原图同目录)

⚠️ `.data/` 目录已被 `.gitignore` 排除，不会提交到版本控制。

## 配置

### 环境变量

复制 `.env.example` 为 `.env.local` 并配置：

```bash
# AI 服务配置（可选）
ANTHROPIC_API_KEY=your_key_here
AI_BASE_URL=https://api.anthropic.com
AI_MODEL=claude-3-5-sonnet-20241022
```

### AI 密钥

也可以通过应用内的设置面板配置 AI 密钥，密钥存储在 `.data/secrets.json`。

## 开发指南

### 数据库迁移

```bash
# 创建新迁移
npm run db:migrate

# 部署迁移（生产环境）
npm run db:deploy
```

### 代码规范

- 遵循 TypeScript 严格模式
- 使用 ESLint 检查代码质量
- 组件优先使用函数式写法
- 服务层不依赖 Next.js 框架 API

### 架构约束

详见 `shadow-narrative-docs/05-TECH_ARCHITECTURE.md`：

- API 路由 → 服务层 → Prisma
- 粒子引擎与 React 解耦
- 所有查询带 userId 条件（多租户准备）
- 文件与数据库记录的两阶段删除

## 文档

完整的产品与技术文档位于 `shadow-narrative-docs/`：

- `01-PRODUCT_SPEC.md` - 产品规格
- `05-TECH_ARCHITECTURE.md` - 技术架构
- `06-PARTICLE_ENGINE.md` - 粒子引擎
- `08-DATA_API_SPEC.md` - 数据与 API
- 更多...

## 浏览器支持

- 需要 WebGL 2.0 支持
- 推荐使用 Chrome、Edge、Firefox、Safari 最新版本
- 不支持 IE

## 许可证

私有项目

## 相关链接

- [Next.js 文档](https://nextjs.org/docs)
- [Three.js 文档](https://threejs.org/docs)
- [Prisma 文档](https://www.prisma.io/docs)
