import { useEffect, useState, type ComponentType } from 'react';
import { ChessGame } from './games/chess/ChessGame';
import { GoGame } from './games/go/GoGame';
import { GomokuGame } from './games/gomoku/GomokuGame';
import { ReversiGame } from './games/reversi/ReversiGame';
import { ShogiGame } from './games/shogi/ShogiGame';
import { RulesPage } from './rules/RulesPage';

interface GameInfo {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  Component: ComponentType<{ onBack(): void; onRules(): void }>;
}

const GAMES: GameInfo[] = [
  { id: 'gomoku', name: '五目並べ', blurb: '5つ並べたら勝ち・連珠にも対応', icon: '●', Component: GomokuGame },
  { id: 'reversi', name: 'リバーシ', blurb: '挟んでひっくり返す', icon: '◐', Component: ReversiGame },
  { id: 'chess', name: 'チェス', blurb: 'キングを追い詰める', icon: '♞︎', Component: ChessGame },
  { id: 'shogi', name: '将棋', blurb: '取った駒を使える・駒落ちも', icon: '将', Component: ShogiGame },
  { id: 'go', name: '囲碁', blurb: '9・13・19路盤・置き碁も', icon: '碁', Component: GoGame },
];

function currentRoute(): string {
  return location.hash.replace(/^#\/?/, '');
}

/** アプリ内の画面遷移。戻るボタンで前の画面に戻れるよう履歴に積む */
function navigate(path: string) {
  history.pushState({ inApp: true }, '', `#/${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** 前の画面がアプリ内なら戻る。直接開いた場合は fallback へ */
function goBack(fallback: string) {
  if (history.state?.inApp) history.back();
  else {
    history.replaceState(null, '', `#/${fallback}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const [section, id] = route.split('/');
  if (section === 'rules') {
    const game = GAMES.find((g) => g.id === id);
    if (game)
      return (
        <RulesPage
          key={game.id}
          gameId={game.id}
          name={game.name}
          onBack={() => goBack('')}
          onPlay={() => navigate(game.id)}
        />
      );
  }

  const game = GAMES.find((g) => g.id === section);
  if (game) {
    return <game.Component key={game.id} onBack={() => goBack('')} onRules={() => navigate(`rules/${game.id}`)} />;
  }

  return (
    <div className="menu">
      <header className="menu-header">
        <h1>ボードゲーム箱</h1>
        <p>遊びたいゲームを選んでください</p>
      </header>
      <ul className="game-list">
        {GAMES.map((g) => (
          <li key={g.id} className={`game-card card-${g.id}`}>
            <a
              className="game-main"
              href={`#/${g.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(g.id);
              }}
            >
              <span className="game-icon" aria-hidden>
                {g.icon}
              </span>
              <span className="game-text">
                <strong>{g.name}</strong>
                <small>{g.blurb}</small>
              </span>
            </a>
            <a
              className="rules-link"
              href={`#/rules/${g.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`rules/${g.id}`);
              }}
            >
              ルール
            </a>
          </li>
        ))}
      </ul>
      <p className="menu-foot">2人対戦・CPU対戦に対応。対局は自動で保存されます。</p>
    </div>
  );
}
