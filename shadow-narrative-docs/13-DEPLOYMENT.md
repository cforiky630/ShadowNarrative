# Shadow Narrative — Deployment & Environment

## 1. Local Development

```text
Node.js LTS       实测 v24.18.0
npm               实测 12.0.2（本机无 pnpm / yarn）
PostgreSQL        实测 18.6，装在 E:\PostgreSQL\18\
Python            实测 3.14.7（E:\miniconda3），配 uv 0.12.5
```

具体版本以项目锁文件为准。

⚠️ npm 12 起默认拦截依赖的 install scripts。批准方式见 `recon/environment.md` §6.2。

### 数据库初始化

```bash
"E:\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -v pw=<密码> -f scripts/setup-db.sql
```

脚本创建 `shadow_narrative` 角色与同名数据库。

## 2. Commands

README 中必须提供：

```text
install

dev

build

start

lint

typecheck
```

`typecheck` → `tsc --noEmit`，CI 必须跑。

Python 服务（Round 6 起）：

```text
python/ 目录下用 uv
uv sync
uv run uvicorn app.main:app --port 8000
```

## 3. Environment Variables

以下为**实际使用**的变量，与 `.env.example` 保持一致：

```bash
# 数据库
DATABASE_URL="postgresql://shadow_narrative:<password>@localhost:5432/shadow_narrative"

# AI（DeepSeek V4.1-Flash，支持视觉，见 09-AI_SPEC.md §20）
AI_PROVIDER=deepseek
AI_MODEL=deepseek-flash
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=

# 应用
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

对象存储相关变量（`STORAGE_ENDPOINT` / `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY` /
`STORAGE_SECRET_KEY`）在引入对象存储时再补。本地开发阶段用文件系统落盘。

Python 图像服务（Round 6 起）：

```bash
IMAGE_SERVICE_URL=http://127.0.0.1:8000
IMAGE_SERVICE_TOKEN=
```

禁止提交真实 secrets。

提供：

`.env.example`（入库，值为占位符）
`.env.local`（**不入库**，`.gitignore` 已覆盖）

**注意 `NEXT_PUBLIC_` 前缀**：只有这个前缀的变量会进入浏览器包。
`AI_API_KEY` 绝不能带该前缀。

## 4. Storage

生产环境推荐对象存储：

- S3 compatible
- R2
- Supabase Storage
- 等价方案

原图和派生图分开管理。

## 5. Database

推荐：

PostgreSQL + Prisma。

必须提供 migration。

## 6. Deployment

可部署到：

- Vercel + managed DB/storage
- Cloudflare + compatible services
- 自有 VPS
- 其他标准 Node/Next 托管

选择最稳定且与项目当前技术栈匹配的方案。

## 7. CI

建议 CI 至少执行：

```text
install
lint
typecheck
test
build
```

## 8. Production Checklist

- secrets configured
- database migrated
- storage configured
- upload limits configured
- auth configured
- AI rate limit configured
- error monitoring configured
- HTTPS enabled
- cache configured
- image transforms verified

## 9. Runtime Observability

建议：

- error monitoring
- performance monitoring
- request metrics

但不要收集不必要的用户记忆内容。

## 10. Preview Environment

每个视觉迭代版本最好可以生成可访问的 preview。

用于：

- 产品检查
- 浏览器检查
- 移动端检查
- 视觉回归
