/**
 * 存档层（Save Store）
 * ------------------------------------------------------------
 * 两条并存的路径，同一套接口：
 *
 * 1) 本地档案（默认，无需任何配置）
 *    - 密码用 PBKDF2-SHA256 派生 256 位密钥（15 万次迭代）
 *    - 数据用 AES-GCM 加密后写进 localStorage
 *    - 密码不落盘，解密失败即为密码错误
 *
 * 2) 云同步（登录后，可选）
 *    - 用 Supabase Auth 登录（GitHub 账号）
 *    - 数据以云端那份为准，本地留一份缓存，断网也能继续玩
 *    - 写入后 1.2 秒合并推送，避免连续操作把请求打爆
 *    - 合并规则见 mergeData：最高分取大值，不会互相覆盖
 *
 * 状态判定（cloudUser 优先）：
 *   已登录           → 数据源是云端 + 本地缓存
 *   empty            → 还没建档案，读写落在「游客区」
 *   locked           → 有档案但未解锁，读写落游客区，不碰密文
 *   unlocked         → 读写落在加密档案里
 *
 * 为什么所有方法都是 async？就是为了今天这一层能无痛加进来 ——
 * 四个游戏和榜单代码一行没动。
 */

import {
  cloudEnabled,
  completeSignIn,
  currentUser,
  deleteCloudState,
  isSignedIn,
  pullState,
  pushState,
  signInWithGitHub,
  signOut as cloudSignOut,
  type CloudUser,
  type SyncPhase,
} from './cloud';

export type VaultState = 'empty' | 'locked' | 'unlocked';
export type SaveData = Record<string, any>;
export type { CloudUser, SyncPhase };

const VAULT_KEY = 'sen.vault.v1';
const GUEST_KEY = 'sen.guest.v1';
const SESSION_KEY = 'sen.session.v1';
const CLOUD_CACHE_KEY = 'sen.cloud.cache.v1';
const ITERATIONS = 150_000;
const MIN_PASS = 6;
/** 写操作合并窗口：连打五局只推一次 */
const PUSH_DELAY = 1200;

/** 旧版本直接写在 localStorage 的最高分，首次启动时搬进游客区 */
const LEGACY_KEYS: Record<string, string> = {
  'fang-snake-best': 'snake',
  'fang-tetris-best': 'tetris',
  'fang-2048-best': '2048',
  'fang-breakout-best': 'breakout',
};

/* ---------------- 基础工具 ---------------- */

const enc = (s: string) => new TextEncoder().encode(s);

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function writePath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function canStore(): boolean {
  try {
    const k = '__sen_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function cryptoReady(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.subtle.deriveKey === 'function';
}

async function deriveKey(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    // 可导出：用于把密钥暂存到 sessionStorage，实现「同一标签页内刷新不掉登录」
    true,
    ['encrypt', 'decrypt'],
  );
}

async function encryptJSON(key: CryptoKey, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc(JSON.stringify(data)),
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decryptJSON(key: CryptoKey, ivB64: string, ctB64: string) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as unknown as BufferSource },
    key,
    fromB64(ctB64) as unknown as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

/** 合并两份存档：best / lines 取大值，plays 取大值，其余覆盖 */
function mergeData(a: SaveData, b: SaveData): SaveData {
  const out: SaveData = { ...a };
  for (const k of Object.keys(b)) {
    if (k === 'games' && typeof b.games === 'object') {
      out.games = { ...(a.games || {}) };
      for (const g of Object.keys(b.games)) {
        const x = out.games[g] || {};
        const y = b.games[g] || {};
        out.games[g] = {
          ...x,
          ...y,
          best: Math.max(Number(x.best) || 0, Number(y.best) || 0),
          plays: Math.max(Number(x.plays) || 0, Number(y.plays) || 0),
          lines: Math.max(Number(x.lines) || 0, Number(y.lines) || 0),
          level: Math.max(Number(x.level) || 0, Number(y.level) || 0),
        };
      }
    } else if (typeof b[k] === 'object' && b[k] !== null && typeof a[k] === 'object' && a[k] !== null) {
      out[k] = { ...a[k], ...b[k] };
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

/* ---------------- 主体 ---------------- */

class SaveStore {
  state: VaultState = 'empty';
  profileName = '';

  /** 已登录的云端账号（未登录为 null） */
  cloudUser: CloudUser | null = null;
  /** 云同步状态：off 表示没配置或没登录 */
  syncPhase: SyncPhase = 'off';
  syncError = '';
  lastSyncAt = 0;

  private meta: { salt: string; iv: string; ct: string } | null = null;
  private key: CryptoKey | null = null;
  private data: SaveData = {};
  private guest: SaveData = {};
  /** 登录态下的数据源（云端那份 + 本地缓存合并） */
  private cloudData: SaveData = {};
  private subs = new Set<() => void>();
  private readyPromise: Promise<void> = Promise.resolve();
  private pushTimer: number | null = null;
  private pushAgain = false;
  private pushing = false;

  constructor() {
    if (!canStore()) return;
    this.readMeta();
    this.guest = this.parse(localStorage.getItem(GUEST_KEY)) || {};
    this.seedLegacy();
    this.state = this.meta ? 'locked' : 'empty';
    this.profileName = readPath(this.guest, 'profile.name') || '';
    this.readyPromise = this.boot();
  }

  /** 启动：先恢复本地会话，再处理登录回调，最后拉云端 */
  private async boot() {
    await this.restoreSession();
    if (!cloudEnabled) return;

    // 登录回调（URL 上带 code）优先处理
    if (!isSignedIn()) {
      try {
        await completeSignIn();
      } catch {
        /* 授权失败就当没登录 */
      }
    }

    const user = currentUser();
    if (!user) return;

    this.cloudUser = user;
    this.cloudData = this.parse(localStorage.getItem(CLOUD_CACHE_KEY)) || {};
    this.syncPhase = 'idle';
    this.profileName = readPath(this.cloudData, 'profile.name') || user.name || '';
    this.emit();

    await this.syncDown();
  }

  /** 等待会话恢复完成（页面刷新后自动解锁用） */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** 同一标签页内刷新不掉登录：密钥暂存 sessionStorage，关闭标签页即消失 */
  private async restoreSession() {
    if (!this.meta || !cryptoReady()) return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const key = await crypto.subtle.importKey(
        'raw',
        fromB64(raw) as unknown as BufferSource,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt'],
      );
      const data = await decryptJSON(key, this.meta.iv, this.meta.ct);
      this.key = key;
      this.data = data && typeof data === 'object' ? data : {};
      this.state = 'unlocked';
      this.profileName = readPath(this.data, 'profile.name') || '';
      this.emit();
    } catch {
      /* 密钥失效（档案被重建过），安静地回到锁定态 */
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  private async saveSession(key: CryptoKey) {
    try {
      const raw = await crypto.subtle.exportKey('raw', key);
      sessionStorage.setItem(SESSION_KEY, toB64(raw));
    } catch {
      /* 拿不到就算了，刷新后重新输密码 */
    }
  }

  private clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  /* ---- 内部 ---- */
  private parse(raw: string | null): SaveData | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private readMeta() {
    const raw = this.parse(localStorage.getItem(VAULT_KEY));
    if (raw && raw.salt && raw.iv && raw.ct) {
      this.meta = { salt: raw.salt, iv: raw.iv, ct: raw.ct };
    }
  }

  private seedLegacy() {
    let changed = false;
    for (const [oldKey, game] of Object.entries(LEGACY_KEYS)) {
      const v = Number(localStorage.getItem(oldKey) || 0);
      if (v > 0) {
        const cur = readPath(this.guest, `games.${game}.best`) || 0;
        if (v > cur) {
          writePath(this.guest, `games.${game}.best`, v);
          writePath(this.guest, `games.${game}.plays`, readPath(this.guest, `games.${game}.plays`) || 0);
          changed = true;
        }
        localStorage.removeItem(oldKey);
      }
    }
    if (changed) this.saveGuest();
  }

  private saveGuest() {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(this.guest));
    } catch {
      /* 空间满了就算了 */
    }
  }

  private async persist() {
    if (!this.key || !this.meta) return;
    const { iv, ct } = await encryptJSON(this.key, this.data);
    this.meta = { salt: this.meta.salt, iv, ct };
    try {
      localStorage.setItem(
        VAULT_KEY,
        JSON.stringify({ v: 1, iter: ITERATIONS, salt: this.meta.salt, iv, ct }),
      );
    } catch {
      /* ignore */
    }
  }

  private snapshot(): SaveData {
    // 登录后云端那份是唯一数据源，其余（游客区/加密档案）只作为合并来源
    if (this.cloudUser) return this.cloudData;
    return this.state === 'unlocked' ? this.data : this.guest;
  }

  private cacheCloud() {
    try {
      localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(this.cloudData));
    } catch {
      /* 空间满了就算了，下次联网还能拉回来 */
    }
  }

  /** 登录态下的写入：先落缓存，再延迟合并推送 */
  private schedulePush() {
    if (!this.cloudUser) return;
    if (this.pushTimer !== null) {
      this.pushAgain = true;
      return;
    }
    this.pushTimer = window.setTimeout(() => {
      this.pushTimer = null;
      void this.flushPush();
    }, PUSH_DELAY);
  }

  private async flushPush() {
    if (!this.cloudUser) return;
    if (this.pushing) {
      this.pushAgain = true;
      return;
    }
    this.pushing = true;
    this.syncPhase = 'syncing';
    this.emit();

    const res = await pushState(this.cloudData);
    this.pushing = false;

    if (res.ok) {
      this.syncPhase = 'synced';
      this.syncError = '';
      this.lastSyncAt = Date.now();
    } else {
      this.syncPhase = 'error';
      this.syncError = res.error;
    }
    this.emit();

    if (this.pushAgain) {
      this.pushAgain = false;
      this.schedulePush();
    }
  }

  private emit() {
    this.subs.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    window.dispatchEvent(new CustomEvent('save:change', { detail: { state: this.state } }));
  }

  /* ---- 对外 ---- */

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /* ---- 云同步 ---- */

  /** 站点是否配置了云端（没配置时登录入口会显示为「未启用」） */
  get cloudAvailable(): boolean {
    return cloudEnabled;
  }

  async signIn(): Promise<{ ok: boolean; error?: string }> {
    if (!cloudEnabled) return { ok: false, error: '站点还没配置云端，见 docs/云同步配置指南.md' };
    return signInWithGitHub();
  }

  signOut(): void {
    cloudSignOut();
    const had = !!this.cloudUser;
    this.cloudUser = null;
    this.cloudData = {};
    this.syncPhase = 'off';
    this.syncError = '';
    this.profileName = this.state === 'unlocked' ? readPath(this.data, 'profile.name') || '' : '';
    try {
      localStorage.removeItem(CLOUD_CACHE_KEY);
    } catch {
      /* ignore */
    }
    if (had) this.emit();
  }

  /** 手动点「立即同步」：先拉后推 */
  async syncNow(): Promise<{ ok: boolean; error?: string }> {
    if (!this.cloudUser) return { ok: false, error: '还没登录' };
    const res = await this.syncDown();
    if (res.ok) await this.flushPush();
    return res;
  }

  /**
   * 从云端拉取并与本地各处数据合并。
   * 合并来源：加密档案（已解锁时）、游客区、本地缓存、云端。
   * mergeData 保证最高分取大值，所以「离线玩的几局」不会被云端冲掉。
   */
  private async syncDown(): Promise<{ ok: boolean; error?: string }> {
    const user = this.cloudUser;
    if (!user) return { ok: false, error: '还没登录' };

    this.syncPhase = 'syncing';
    this.syncError = '';
    this.emit();

    const res = await pullState();
    if (!res.ok) {
      this.syncPhase = 'error';
      this.syncError = res.error;
      // 令牌彻底失效：退回未登录态，避免一直报错
      if (res.error.includes('重新登录')) {
        cloudSignOut();
        this.cloudUser = null;
        this.syncPhase = 'off';
      }
      this.emit();
      return { ok: false, error: res.error };
    }

    const remote = res.snapshot?.data || {};
    let merged: SaveData = { ...remote };

    // 加密档案里的明文（仅已解锁才有）
    if (this.state === 'unlocked' && Object.keys(this.data).length) {
      merged = mergeData(merged, this.data);
    }
    // 游客区：登录前玩的那些局
    if (Object.keys(this.guest).length) {
      merged = mergeData(merged, this.guest);
    }
    // 上次的本地缓存（可能比云端更新）
    if (Object.keys(this.cloudData).length) {
      merged = mergeData(merged, this.cloudData);
    }

    // 补一个 profile，云端新用户也能有名字
    if (!readPath(merged, 'profile.name')) {
      writePath(merged, 'profile.name', user.name || '玩家');
    }
    if (!readPath(merged, 'profile.createdAt')) {
      writePath(merged, 'profile.createdAt', Date.now());
    }

    this.cloudData = merged;
    this.cacheCloud();
    this.profileName = readPath(merged, 'profile.name') || '';

    // 本地数据已经吸收进云端，游客区可以清掉了
    if (Object.keys(this.guest).length) {
      this.guest = {};
      try {
        localStorage.removeItem(GUEST_KEY);
      } catch {
        /* ignore */
      }
    }

    this.syncPhase = 'synced';
    this.lastSyncAt = Date.now();
    this.emit();

    // 云端原本是空的，或本地有云端没有的记录 → 回推一次
    if (!res.snapshot || JSON.stringify(merged) !== JSON.stringify(remote)) {
      await this.flushPush();
    }
    return { ok: true };
  }

  hasVault(): boolean {
    return !!this.meta;
  }

  async setup(pass: string, name: string): Promise<{ ok: boolean; error?: string }> {
    if (!cryptoReady()) return { ok: false, error: '当前环境不支持加密（需要 HTTPS 或 localhost）' };
    if (pass.length < MIN_PASS) return { ok: false, error: `密码至少 ${MIN_PASS} 位` };

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pass, salt);
    this.key = key;
    this.meta = { salt: toB64(salt), iv: '', ct: '' };
    this.data = {
      profile: { name: name.trim() || '玩家', createdAt: Date.now() },
      games: {},
    };
    // 把游客区已有的最高分并进新档案
    this.data = mergeData(this.data, { games: this.guest.games || {} });
    this.guest = {};
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
    await this.persist();
    this.state = 'unlocked';
    this.profileName = this.data.profile.name;
    await this.saveSession(key);
    this.emit();
    return { ok: true };
  }

  async unlock(pass: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.meta) return { ok: false, error: '还没有档案' };
    if (!cryptoReady()) return { ok: false, error: '当前环境不支持解密' };
    try {
      const key = await deriveKey(pass, fromB64(this.meta.salt));
      const data = await decryptJSON(key, this.meta.iv, this.meta.ct);
      this.key = key;
      this.data = data && typeof data === 'object' ? data : {};
      // 游客区有记录就并进来
      if (this.guest.games) {
        this.data = mergeData(this.data, { games: this.guest.games });
        this.guest = {};
        try {
          localStorage.removeItem(GUEST_KEY);
        } catch {
          /* ignore */
        }
        await this.persist();
      }
      this.state = 'unlocked';
      this.profileName = readPath(this.data, 'profile.name') || '';
      await this.saveSession(key);
      this.emit();
      return { ok: true };
    } catch {
      return { ok: false, error: '密码不对' };
    }
  }

  lock(): void {
    this.key = null;
    this.data = {};
    this.state = this.meta ? 'locked' : 'empty';
    this.profileName = '';
    this.clearSession();
    this.emit();
  }

  async get<T = any>(path: string, fallback?: T): Promise<T> {
    await this.readyPromise;
    const v = readPath(this.snapshot(), path);
    return v === undefined ? (fallback as T) : (v as T);
  }

  async set(path: string, value: any): Promise<void> {
    await this.readyPromise;
    if (this.cloudUser) {
      writePath(this.cloudData, path, value);
      this.cacheCloud();
      this.schedulePush();
    } else if (this.state === 'unlocked') {
      writePath(this.data, path, value);
      await this.persist();
    } else {
      writePath(this.guest, path, value);
      this.saveGuest();
    }
    this.emit();
  }

  async update<T = any>(path: string, fn: (cur: T | undefined) => T): Promise<T> {
    const cur = await this.get<T>(path, undefined);
    const next = fn(cur);
    await this.set(path, next);
    return next;
  }

  async all(): Promise<SaveData> {
    await this.readyPromise;
    return JSON.parse(JSON.stringify(this.snapshot()));
  }

  async exportText(): Promise<string> {
    await this.readyPromise;
    return JSON.stringify(
      {
        app: "sen's space",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: this.snapshot(),
      },
      null,
      2,
    );
  }

  async importText(text: string): Promise<{ ok: boolean; error?: string }> {
    await this.readyPromise;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: '文件格式不对，不是有效的 JSON' };
    }
    const incoming = parsed?.data ?? parsed;
    if (!incoming || typeof incoming !== 'object') return { ok: false, error: '文件里没有可用的数据' };

    if (this.state === 'unlocked') {
      this.data = mergeData(this.data, incoming);
      await this.persist();
    } else {
      this.guest = mergeData(this.guest, incoming);
      this.saveGuest();
    }
    this.emit();
    return { ok: true };
  }

  /** 删除档案。opt.cloud 为真时同时清空云端那份（账号保持登录） */
  async reset(opt: { cloud?: boolean } = {}): Promise<void> {
    if (opt.cloud && this.cloudUser) {
      await deleteCloudState();
    }
    try {
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(GUEST_KEY);
      localStorage.removeItem(CLOUD_CACHE_KEY);
    } catch {
      /* ignore */
    }
    this.clearSession();
    this.meta = null;
    this.key = null;
    this.data = {};
    this.guest = {};
    this.cloudData = {};
    this.state = 'empty';
    this.profileName = this.cloudUser ? this.cloudUser.name || '' : '';
    this.emit();
  }

  usageBytes(): number {
    try {
      return (localStorage.getItem(VAULT_KEY) || '').length + (localStorage.getItem(GUEST_KEY) || '').length;
    } catch {
      return 0;
    }
  }
}

export const store = new SaveStore();

/* ---------------- 游戏侧便捷函数 ---------------- */

export interface GameStat {
  best: number;
  plays: number;
  last: number;
  at: number;
  lines?: number;
  level?: number;
}

export async function readStat(game: string): Promise<GameStat> {
  return store.get<GameStat>(`games.${game}`, { best: 0, plays: 0, last: 0, at: 0 });
}

/** 记录一局：更新最高分、局数、最近得分 */
export async function recordRun(
  game: string,
  score: number,
  extra: Partial<GameStat> = {},
): Promise<GameStat> {
  return store.update<GameStat>(`games.${game}`, (cur) => {
    const base: GameStat = cur || { best: 0, plays: 0, last: 0, at: 0 };
    return {
      ...base,
      ...extra,
      best: Math.max(Number(base.best) || 0, score),
      plays: (Number(base.plays) || 0) + 1,
      last: score,
      at: Date.now(),
    };
  });
}

/* ---------------- 站点互动（同一套存储，登录后自动上云） ---------------- */

export interface ReadRecord {
  at: number;
  /** 0–1 的阅读进度，用来做「上次读到哪」 */
  progress: number;
}

export async function isBookmarked(slug: string): Promise<boolean> {
  return !!(await store.get<number>(`bookmarks.${slug}`));
}

/** 返回切换之后的状态：true = 已收藏 */
export async function toggleBookmark(slug: string): Promise<boolean> {
  const cur = await store.get<number>(`bookmarks.${slug}`);
  if (cur) {
    await store.set(`bookmarks.${slug}`, 0);
    return false;
  }
  await store.set(`bookmarks.${slug}`, Date.now());
  return true;
}

export async function isLiked(slug: string): Promise<boolean> {
  return !!(await store.get<number>(`likes.${slug}`));
}

export async function toggleLike(slug: string): Promise<boolean> {
  const cur = await store.get<number>(`likes.${slug}`);
  if (cur) {
    await store.set(`likes.${slug}`, 0);
    return false;
  }
  await store.set(`likes.${slug}`, Date.now());
  return true;
}

/** 记录阅读进度，滚动时低频调用即可 */
export async function markRead(slug: string, progress: number): Promise<void> {
  const p = Math.max(0, Math.min(1, progress));
  const cur = await store.get<ReadRecord>(`reads.${slug}`);
  // 进度只增不减，倒着滚回顶部不算
  if (cur && cur.progress >= p) {
    await store.set(`reads.${slug}`, { at: Date.now(), progress: cur.progress });
    return;
  }
  await store.set(`reads.${slug}`, { at: Date.now(), progress: p });
}
