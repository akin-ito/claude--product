import type { Level } from './types';

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export interface AiRequest<M> {
  promise: Promise<M>;
  /** 思考を中断する（待ったや新規対局のとき） */
  cancel(): void;
}

/** CPU の手を Web Worker で考える。思考中も画面は固まらない */
export function requestAiMove<M>(game: string, state: unknown, level: Level): AiRequest<M> {
  const id = nextId++;
  const w = getWorker();
  let settled = false;
  let onCancel = () => {};
  const promise = new Promise<M>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; move: M }>) => {
      if (e.data.id !== id) return;
      settled = true;
      w.removeEventListener('message', onMessage);
      resolve(e.data.move);
    };
    w.addEventListener('message', onMessage);
    onCancel = () => {
      w.removeEventListener('message', onMessage);
      reject(new Error('cancelled'));
    };
    w.postMessage({ id, game, state, level });
  });
  promise.catch(() => {});
  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      onCancel();
      // 計算中のワーカーは止めて作り直す
      worker?.terminate();
      worker = null;
    },
  };
}
