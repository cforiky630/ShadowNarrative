-- Shadow Narrative — 本地数据库初始化
-- 用 postgres 超级用户执行一次即可。
--
-- 运行方式（在项目根目录）：
--   "E:\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -f scripts/setup-db.sql
--
-- 会提示输入新角色的密码。密码就在 .env.local 的 DATABASE_URL 里：
--   postgresql://shadow_narrative:<这一段>@localhost:5432/shadow_narrative
-- 两处必须一致。
--
-- 本文件不含任何明文密码，可以安全入库。

\prompt 'shadow_narrative 角色的密码（从 .env.local 复制）: ' sn_password

CREATE ROLE shadow_narrative WITH LOGIN PASSWORD :'sn_password';

CREATE DATABASE shadow_narrative OWNER shadow_narrative;

\echo ''
\echo '--- 验证 ---'
\du shadow_narrative
\l shadow_narrative
