import { subscribe } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('data: connected\n\n'));

            const unsubscribe = subscribe((data) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (e) {
                    unsubscribe();
                }
            });

            request.signal.addEventListener('abort', () => {
                unsubscribe();
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
