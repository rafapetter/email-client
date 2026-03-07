import { auth } from '@/lib/auth';
import { getEmaiForAccount } from '@/lib/emai-client';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return new Response('Missing accountId parameter', { status: 400 });
  }

  const encoder = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to write SSE-formatted data
      function send(event: string, data: unknown) {
        if (signal.aborted) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream closed
        }
      }

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        if (signal.aborted) {
          clearInterval(pingInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30_000);

      // Clean up on client disconnect
      signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      try {
        const emai = await getEmaiForAccount(accountId);

        // Send initial connection confirmation
        send('connected', { accountId, timestamp: new Date().toISOString() });

        // Listen for emai events
        emai.on('email:new', (email: unknown) => {
          send('email:new', email);
        });

        emai.on('email:updated', (email: unknown) => {
          send('email:updated', email);
        });

        emai.on('email:deleted', (data: unknown) => {
          send('email:deleted', data);
        });

        emai.on('folder:updated', (folder: unknown) => {
          send('folder:updated', folder);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to connect';
        send('error', { message });
        clearInterval(pingInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
