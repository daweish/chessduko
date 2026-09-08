/// <reference lib="webworker" />
import { GenerateDailySet } from './engine';
self.onmessage = (event: MessageEvent<{ request_id: number; seed: string }>) => {
  const { request_id, seed } = event.data;
  try {
    self.postMessage({ request_id, result: GenerateDailySet(seed) });
  } catch {
    self.postMessage({ request_id, error: 'worker-failed' });
  }
};
