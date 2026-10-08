/** 0 = 先手（黒・白番のチェスでは白）, 1 = 後手 */
export type Player = 0 | 1;

/** CPU の強さ */
export type Level = 1 | 2 | 3;

/** 終局結果。winner が null なら引き分け */
export interface Outcome {
  winner: Player | null;
  reason: string;
}

/**
 * 各ゲームのルールエンジンが実装するインターフェース。
 * 状態 S は Web Worker に渡せるよう、プレーンなオブジェクト・配列だけで構成する。
 */
export interface GameEngine<S, M, O = Record<string, never>> {
  initial(options: O): S;
  turn(s: S): Player;
  /** 合法手であることを前提に、手を適用した新しい状態を返す（元の状態は変更しない） */
  apply(s: S, m: M): S;
  outcome(s: S): Outcome | null;
  /** CPU が手を指してよい局面か（囲碁の死石確認中などは false） */
  cpuCanAct?(s: S): boolean;
}

export const other = (p: Player): Player => (p === 0 ? 1 : 0);
