/** 探索の制限時間を管理する。期限切れで Abort を投げて探索を打ち切る */
export class Deadline {
  private readonly end: number;
  private counter = 0;

  constructor(ms: number) {
    this.end = Date.now() + ms;
  }

  check(): void {
    if ((++this.counter & 1023) === 0 && Date.now() > this.end) throw ABORT;
  }

  expired(): boolean {
    return Date.now() > this.end;
  }
}

export const ABORT = { aborted: true };

export function isAbort(e: unknown): boolean {
  return e === ABORT;
}

/** 配列をシャッフルした新しい配列を返す */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** シード付きの擬似乱数（mulberry32） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
