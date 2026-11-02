/**
 * 云同步客户端（Supabase Auth + REST）
 * ------------------------------------------------------------
 * 为什么不用 @supabase/supabase-js：
 *   这个博客一直是零第三方运行时依赖，只需要「登录 / 续期 / 读一行 / 写一行」
 *   四个动作，用官方 REST 直连约 200 行，比引一个 SDK 更轻。
 *
 * 安全模型：
 *   - anon key 在前端公开，符合 Supabase 设计
 *   - 真正的隔离靠数据库 RLS：auth.uid() = user_id，谁都读不到别人的行
 *   - access_token 存 localStorage，过期前自动用 refresh_token 续
 *
 * 未配置时所有方法都安静地返回「未启用」，不会抛错。
 */

import { CLOUD_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL, redirectTarget } from './cloud-config';

export interface CloudUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'synced' | 'error';

interface Session {
  access_token: string;
  refresh_token: string;
  /** 毫秒时间戳 */
  expires_at: number;
  user: CloudUser;
}

const SESSION_KEY = 'sen.cloud.session.v1';
const VERIFIER_KEY = 'sen.cloud.pkce.v1';
const TABLE = 'player_state';

export const cloudEnabled = CLOUD_ENABLED;

/* ---------------- 小工具 ---------------- */

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(buf));
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.access_token || !s?.refresh_token || !s?.user?.id) return null;
    return s as Session;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeUser(raw: any): CloudUser {
  const meta = raw?.user_metadata || {};
  return {
    id: String(raw?.id || ''),
    name: String(meta.user_name || meta.preferred_username || meta.full_name || meta.name || ''),
    email: String(raw?.email || ''),
    avatar: String(meta.avatar_url || meta.picture || ''),
  };
}

function toSession(payload: any): Session {
  const ttl = Number(payload?.expires_in) || 3600;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    // 提前 90 秒过期，避免边界上刚好失效
    expires_at: Date.now() + Math.max(60, ttl - 90) * 1000,
    user: normalizeUser(payload.user),
  };
}

/** 从错误响应里提炼一句人话 */
async function explain(res: Response): Promise<string> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  const code = String(body?.code || '');
  if (code === 'PGRST205' || code === '42P01') {
    return '云端表还没建好：请在 Supabase 里执行 docs/supabase-schema.sql';
  }
  if (code === 'PGRST106') {
    return '表没暴露给 API：后台 Settings → API → Exposed schemas 里加上 public';
  }
  if (res.status === 401 || res.status === 403) {
    return '登录状态已失效，请重新登录';
  }
  return String(body?.msg || body?.message || body?.error_description || body?.error || `请求失败（${res.status}）`);
}

/* ---------------- 对外 API ---------------- */

export function currentUser(): CloudUser | null {
  return readSession()?.user ?? null;
}

export function isSignedIn(): boolean {
  return !!readSession();
}

/** 发起 GitHub 登录：跳转到 Supabase 授权页，回来时带 code */
export async function signInWithGitHub(): Promise<{ ok: boolean; error?: string }> {
  if (!CLOUD_ENABLED) return { ok: false, error: '还没配置云端（见 src/lib/cloud-config.ts）' };

  const verifier = randomString(48);
  const challenge = await sha256(verifier);
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
  } catch {
    return { ok: false, error: '浏览器禁用了会话存储，无法完成登录' };
  }

  const url =
    `${SUPABASE_URL}/auth/v1/authorize?provider=github` +
    `&redirect_to=${encodeURIComponent(redirectTarget())}` +
    `&code_challenge=${challenge}&code_challenge_method=s256` +
    `&scopes=read:user`;

  window.location.href = url;
  return { ok: true };
}

/**
 * 处理授权回调：URL 里带 ?code=... 时换出会话。
 * 在 store 初始化时调用一次即可，没有回调参数时直接返回 null。
 */
export async function completeSignIn(): Promise<CloudUser | null> {
  if (!CLOUD_ENABLED || typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;

  // 无论成败都把 code 从地址栏抹掉，避免刷新重复使用
  const clean = new URL(window.location.href);
  clean.searchParams.delete('code');
  clean.searchParams.delete('state');
  window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);

  let verifier = '';
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY) || '';
    sessionStorage.removeItem(VERIFIER_KEY);
  } catch {
    /* ignore */
  }
  if (!verifier) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });

  if (!res.ok) return null;
  const payload = await res.json();
  if (!payload?.access_token) return null;

  const session = toSession(payload);
  writeSession(session);
  return session.user;
}

export function signOut(): void {
  const s = readSession();
  writeSession(null);
  // 顺便通知服务端作废令牌，失败也无所谓
  if (s?.access_token && CLOUD_ENABLED) {
    void fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` },
    }).catch(() => {});
  }
}

/** 取一个可用的 access_token，快过期或已过期就自动续期 */
async function getToken(): Promise<string | null> {
  const s = readSession();
  if (!s) return null;
  if (Date.now() < s.expires_at) return s.access_token;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });

  if (!res.ok) {
    // refresh_token 也废了：清掉本地会话，当作未登录
    writeSession(null);
    return null;
  }
  const payload = await res.json();
  const next = toSession({ ...payload, user: payload.user ?? s.user });
  writeSession(next);
  return next.access_token;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getToken();
  if (!token) return null;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface CloudSnapshot {
  data: Record<string, any>;
  updatedAt: number;
}

/** 拉取当前用户云端的那一行 */
export async function pullState(): Promise<
  { ok: true; snapshot: CloudSnapshot | null } | { ok: false; error: string }
> {
  if (!CLOUD_ENABLED) return { ok: false, error: '云同步未启用' };
  const user = currentUser();
  if (!user) return { ok: false, error: '未登录' };

  const headers = await authHeaders();
  if (!headers) return { ok: false, error: '登录状态已失效，请重新登录' };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=data,updated_at&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers },
    );
    if (!res.ok) return { ok: false, error: await explain(res) };

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, snapshot: null };
    const row = rows[0];
    return {
      ok: true,
      snapshot: {
        data: row?.data && typeof row.data === 'object' ? row.data : {},
        updatedAt: row?.updated_at ? Date.parse(row.updated_at) || 0 : 0,
      },
    };
  } catch {
    return { ok: false, error: '网络不通，稍后会自动重试' };
  }
}

/** 把整份数据写上去（upsert，一个用户一行） */
export async function pushState(data: Record<string, any>): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CLOUD_ENABLED) return { ok: false, error: '云同步未启用' };
  const user = currentUser();
  if (!user) return { ok: false, error: '未登录' };

  const headers = await authHeaders();
  if (!headers) return { ok: false, error: '登录状态已失效，请重新登录' };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{ user_id: user.id, data, updated_at: new Date().toISOString() }]),
    });
    if (!res.ok) return { ok: false, error: await explain(res) };
    return { ok: true };
  } catch {
    return { ok: false, error: '网络不通，稍后会自动重试' };
  }
}

/** 清空云端数据（删档案时用） */
export async function deleteCloudState(): Promise<{ ok: boolean; error?: string }> {
  if (!CLOUD_ENABLED) return { ok: false, error: '云同步未启用' };
  const user = currentUser();
  if (!user) return { ok: false, error: '未登录' };
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: '登录状态已失效' };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(user.id)}`,
      { method: 'DELETE', headers },
    );
    if (!res.ok) return { ok: false, error: await explain(res) };
    return { ok: true };
  } catch {
    return { ok: false, error: '网络不通' };
  }
}
