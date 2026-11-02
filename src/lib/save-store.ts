/**
 * 存档层（Save Store）
 * ------------------------------------------------------------
 * 当前实现：本地加密保险箱
 *   - 密码用 PBKDF2-SHA256 派生 256 位密钥（15 万次迭代）
 *   - 数据用 AES-GCM 加密后写进 localStorage
 *   - 密码不落盘，解密失败即为密码错误
 *
 * 为什么所有方法都是 async？
 *   将来换成 Supabase（或任何后端）时，只需要替换本文件里
 *   get / set / update / persist 的内部实现，游戏代码一行都不用改：
 *
 *   // 现在
 *   await store.update('games.snake', r => ({ ...r, best: score }));
 *   // 以后（同样一行）
 *   await store.update('games.snake', r => ({ ...r, best: score }));
 *
 * 三种状态：
 *   empty    —— 还没建档案，读写落到「游客区」（明文 localStorage）
 *   locked   —— 有档案但未解锁，读写同样落游客区，不碰密文
 *   unlocked —— 读写落在加密档案里
 */

export type VaultState = 'empty' | 'locked' | 'unlocked';
export type SaveData = Record<string, any>;

const VAULT_KEY = 'sen.vault.v1';
const GUEST_KEY = 'sen.guest.v1';
const SESSION_KEY = 'sen.session.v1';
const ITERATIONS = 150_000;
const MIN_PASS = 6;

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

  private meta: { salt: string; iv: string; ct: string } | null = null;
  private key: CryptoKey | null = null;
  private data: SaveData = {};
  private guest: SaveData = {};
  private subs = new Set<() => void>();
  private readyPromise: Promise<void> = Promise.resolve();

  constructor() {
    if (!canStore()) return;
    this.readMeta();
    this.guest = this.parse(localStorage.getItem(GUEST_KEY)) || {};
    this.seedLegacy();
    this.state = this.meta ? 'locked' : 'empty';
    this.profileName = readPath(this.guest, 'profile.name') || '';
    this.readyPromise = this.restoreSession();
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
    return this.state === 'unlocked' ? this.data : this.guest;
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
    if (this.state === 'unlocked') {
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

  async reset(): Promise<void> {
    try {
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
    this.clearSession();
    this.meta = null;
    this.key = null;
    this.data = {};
    this.guest = {};
    this.state = 'empty';
    this.profileName = '';
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
