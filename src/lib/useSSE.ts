'use client';

import { useEffect, useRef } from 'react';

export function useSSE(handlers: Record<string, () => void>) {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout>;

        const connect = () => {
            if (eventSource) {
                eventSource.close();
            }

            eventSource = new EventSource('/api/sse');

            eventSource.onmessage = (event) => {
                const data = event.data?.trim();
                if (!data || data === 'connected') return;

                const handler = handlersRef.current[data];
                if (handler) {
                    handler();
                }
            };

            eventSource.onerror = () => {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                reconnectTimer = setTimeout(connect, 2000);
            };
        };

        connect();

        return () => {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            clearTimeout(reconnectTimer);
        };
    }, []);
}
