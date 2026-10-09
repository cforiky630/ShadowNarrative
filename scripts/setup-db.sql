-- Shadow Narrative — 本地数据库初始化
--
-- 运行方式（在项目根目录，密码从 .env.local 取）：
--   "E:\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -v pw=<密码> -f scripts/setup-db.sql
--
-- 本文件不含明文密码，可以安全入库。

CREATE ROLE shadow_narrative WITH LOGIN PASSWORD :'pw';

CREATE DATABASE shadow_narrative OWNER shadow_narrative;

\echo ''
\echo '--- 验证 ---'
\du shadow_narrative
\l shadow_narrative
