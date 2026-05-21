type Listener = (data: string) => void;

const clients = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
    clients.add(listener);
    return () => { clients.delete(listener); };
}

export function broadcast(data: string): void {
    clients.forEach(listener => {
        try { listener(data); } catch (e) { /* ignore */ }
    });
}
