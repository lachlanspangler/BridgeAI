// Worker entry: register tsx so the TypeScript render worker can load, whatever launched the parent.
import { register } from 'tsx/esm/api';
import { workerData } from 'node:worker_threads';

register();
await import(workerData.__entry);
