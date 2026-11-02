/**
 * 云同步配置（Supabase）
 * ------------------------------------------------------------
 * 只填两个值，填完重新构建就生效；留空则整站自动降级为纯本地，
 * 玩家档案、游戏战绩一切照旧，不会有任何报错。
 *
 *   1. SUPABASE_URL      形如 https://abcdefghijklmn.supabase.co
 *   2. SUPABASE_ANON_KEY 后台 Settings → API Keys → anon / publishable key
 *
 * anon key 放在前端是官方设计允许的：它只能做「匿名能做的事」，
 * 真正的权限由数据库的 RLS 行级策略把关（见 docs/supabase-schema.sql）。
 * 千万不要把 service_role key 填到这里，那个能绕过所有权限。
 *
 * 也支持用环境变量覆盖（本地 .env 或 GitHub Actions Secrets）：
 *   PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
 */

const fromEnv = (key: string): string => {
  try {
    const env = (import.meta as any)?.env || {};
    return typeof env[key] === 'string' ? env[key].trim() : '';
  } catch {
    return '';
  }
};

export const SUPABASE_URL = (fromEnv('PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');

export const SUPABASE_ANON_KEY = fromEnv('PUBLIC_SUPABASE_ANON_KEY') || '';

/** 配置是否可用：URL 像样 + key 够长才认为启用了云同步 */
export const CLOUD_ENABLED =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 40;

/** 登录后回到哪里（必须在 Supabase 的 Redirect URLs 白名单里） */
export function redirectTarget(): string {
  if (typeof window === 'undefined') return '/games/';
  // 回到当前页，不要把人从文章页踢到游戏厅
  return `${window.location.origin}${window.location.pathname}`;
}
