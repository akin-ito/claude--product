import type { TimePreset } from '../components/GameShell';

const none: TimePreset = { name: 'なし', time: { kind: 'none' } };

/** ゲームごとの、よく使われる持ち時間 */
export const TIME_PRESETS: Record<string, TimePreset[]> = {
  chess: [
    none,
    { name: 'ブリッツ 3分＋2秒', time: { kind: 'fischer', mainSec: 180, incSec: 2 } },
    { name: 'ブリッツ 5分切れ負け', time: { kind: 'sudden', mainSec: 300 } },
    { name: 'ラピッド 10分＋5秒', time: { kind: 'fischer', mainSec: 600, incSec: 5 } },
    { name: 'ラピッド 15分＋10秒', time: { kind: 'fischer', mainSec: 900, incSec: 10 } },
    { name: 'クラシカル 90分＋30秒', time: { kind: 'fischer', mainSec: 5400, incSec: 30 } },
    { name: '30分・遅延5秒（米国式）', time: { kind: 'delay', mainSec: 1800, delaySec: 5 } },
  ],
  shogi: [
    none,
    { name: '10分切れ負け', time: { kind: 'sudden', mainSec: 600 } },
    { name: '持ち時間なし・秒読み30秒', time: { kind: 'byoyomi', mainSec: 0, periodSec: 30, periods: 1 } },
    { name: '10分＋秒読み30秒', time: { kind: 'byoyomi', mainSec: 600, periodSec: 30, periods: 1 } },
    { name: '20分＋秒読み30秒', time: { kind: 'byoyomi', mainSec: 1200, periodSec: 30, periods: 1 } },
    { name: '5分＋1手5秒加算', time: { kind: 'fischer', mainSec: 300, incSec: 5 } },
  ],
  go: [
    none,
    { name: '10分＋秒読み30秒×3回', time: { kind: 'byoyomi', mainSec: 600, periodSec: 30, periods: 3 } },
    { name: '30分＋秒読み30秒×5回', time: { kind: 'byoyomi', mainSec: 1800, periodSec: 30, periods: 5 } },
    { name: 'カナダ式 10分＋25手5分', time: { kind: 'canadian', mainSec: 600, periodSec: 300, moves: 25 } },
    { name: '5分＋1手10秒加算', time: { kind: 'fischer', mainSec: 300, incSec: 10 } },
    { name: '10分切れ負け', time: { kind: 'sudden', mainSec: 600 } },
  ],
  othello: [
    none,
    { name: '10分切れ負け', time: { kind: 'sudden', mainSec: 600 } },
    { name: '20分切れ負け', time: { kind: 'sudden', mainSec: 1200 } },
    { name: '30分切れ負け（公式戦）', time: { kind: 'sudden', mainSec: 1800 } },
    { name: '5分＋1手5秒加算', time: { kind: 'fischer', mainSec: 300, incSec: 5 } },
  ],
  gomoku: [
    none,
    { name: '10分切れ負け', time: { kind: 'sudden', mainSec: 600 } },
    { name: '6分＋1手10秒加算', time: { kind: 'fischer', mainSec: 360, incSec: 10 } },
    { name: '10分＋秒読み30秒', time: { kind: 'byoyomi', mainSec: 600, periodSec: 30, periods: 1 } },
  ],
};
