// Fixed-window rate limiter (per key). In production a single Worker
// isolate enforces this per-isolate; documented as a demo-grade control,
// complemented by provider quotas and the router's quota fallback.
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private limit: number, private windowMs = 60000) {}
  check(key: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: this.limit - 1, retryAfterSec: 0 };
    }
    if (w.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((w.start + this.windowMs - now) / 1000) };
    }
    w.count += 1;
    return { allowed: true, remaining: this.limit - w.count, retryAfterSec: 0 };
  }
}

/** Per-session upload counter enforcing the public-demo file budget. */
export class UploadBudget {
  private counts = new Map<string, number>();
  constructor(private maxFiles: number) {}
  tryConsume(session: string): boolean {
    const n = this.counts.get(session) ?? 0;
    if (n >= this.maxFiles) return false;
    this.counts.set(session, n + 1);
    return true;
  }
  used(session: string): number { return this.counts.get(session) ?? 0; }
}
