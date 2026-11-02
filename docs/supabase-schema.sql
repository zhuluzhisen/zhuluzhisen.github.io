-- ============================================================
-- 森 · SEN'S SPACE —— 云同步建表脚本
-- 用法：Supabase 后台 → 左侧 SQL Editor → New query → 整段粘贴 → Run
-- 可重复执行，不会重复建表或重复建策略。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 主表：一个用户一行，数据全放在 data 这个 jsonb 里
--    为什么不拆成多张表：战绩结构以后还会变（新游戏、新字段），
--    jsonb 免去每次改表结构，个人站的数据量也完全不需要索引优化。
-- ------------------------------------------------------------
create table if not exists public.player_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.player_state is '玩家云端存档：战绩、收藏、阅读进度';

-- ------------------------------------------------------------
-- 2. 开 RLS（这一步是安全的关键，别跳过）
--    开了 RLS 之后默认全拒，只有下面策略放行的才通。
-- ------------------------------------------------------------
alter table public.player_state enable row level security;

-- 读：只能读自己那行
drop policy if exists "player_state_select_own" on public.player_state;
create policy "player_state_select_own"
  on public.player_state
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 写：只能插自己那行（user_id 必须等于当前登录用户，伪造别人的直接拒）
drop policy if exists "player_state_insert_own" on public.player_state;
create policy "player_state_insert_own"
  on public.player_state
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- 改：只能改自己那行
drop policy if exists "player_state_update_own" on public.player_state;
create policy "player_state_update_own"
  on public.player_state
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 删：只能删自己那行
drop policy if exists "player_state_delete_own" on public.player_state;
create policy "player_state_delete_own"
  on public.player_state
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 3. 权限（Supabase 通常会默认给，写一遍防止踩坑）
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.player_state to authenticated;
-- 未登录用户（anon）什么都不给：云同步必须登录
revoke all on public.player_state from anon;

-- ------------------------------------------------------------
-- 4. 自检：跑完这段应该返回 rowsecurity = true
-- ------------------------------------------------------------
select
  c.relname                as 表名,
  c.relrowsecurity         as 已开启RLS,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'player_state') as 策略数量
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'player_state';


-- ============================================================
-- 附：如果前端报「表没暴露给 API」（错误码 PGRST106 / 404）
-- ------------------------------------------------------------
-- 2026-10-30 起 Supabase 不再自动把 public schema 暴露给 Data API。
-- 优先在后台点：Settings → API → Exposed schemas → 勾上 public → Save。
--
-- 如果后台界面找不到这一项，可以用下面这段 SQL 强制打开（二选一，不要都跑）：
--
--   alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public';
--   notify pgrst, 'reload config';
--
-- 执行完等 5～10 秒再刷新页面。
-- ============================================================
