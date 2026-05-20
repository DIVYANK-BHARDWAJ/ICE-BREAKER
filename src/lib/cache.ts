// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, { data: any; expiresAt: number }>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<string, Promise<any>>();

export function getCached<T>(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(key: string): void {
    store.delete(key);
}

export function invalidateCacheByPrefix(prefix: string): void {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key);
        }
    }
}

// Request coalescing – when N requests hit simultaneously for the same key,
// only one fetches, the rest wait for the same Promise.
export async function withDedup<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
): Promise<T> {
    const existing = getCached<T>(key);
    if (existing !== null) return existing;

    const inFlight = pending.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const promise = fetcher().then((data) => {
        setCache(key, data, ttlMs);
        pending.delete(key);
        return data;
    }).catch((err) => {
        pending.delete(key);
        throw err;
    });

    pending.set(key, promise);
    return promise;
}
