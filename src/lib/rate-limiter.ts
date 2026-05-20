// Simple in-memory sliding-window rate limiter
const hits = new Map<string, number[]>();

const WINDOW_MS = 1000;
const MAX_HITS = 20;

export function checkRateLimit(key: string): boolean {
    const now = Date.now();
    const window = hits.get(key) ?? [];
    const recent = window.filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_HITS) {
        hits.set(key, recent);
        return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
}
