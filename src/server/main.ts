/**
 * Start Bridge on 127.0.0.1 only. There is deliberately no option to bind anything else in this version
 * (hard rule: local-first, no public exposure). Port: BRIDGE_PORT (default 7411).
 */
import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from './app.ts';

export const HOST = '127.0.0.1';

export function start(port = Number(process.env.BRIDGE_PORT ?? 7411)) {
  if (process.env.BRIDGE_HOST && process.env.BRIDGE_HOST !== HOST && process.env.BRIDGE_HOST !== 'localhost') {
    throw new Error('Bridge only binds to 127.0.0.1 in this version (see docs/adr/0006-localhost-security.md)');
  }
  const { app, queue } = createApp({ port, webDist: join(import.meta.dirname, '..', '..', 'web', 'dist') });
  const server = serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
    console.log(`Bridge is running at http://127.0.0.1:${info.port}  (local only)`);
  });
  const stop = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return { server, queue };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) start();
