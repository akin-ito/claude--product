import { useEffect, useState, type ComponentType } from 'react';
import { ChessGame } from './games/chess/ChessGame';
import { GoGame } from './games/go/GoGame';
import { GomokuGame } from './games/gomoku/GomokuGame';
import { OthelloGame } from './games/othello/OthelloGame';
import { ShogiGame } from './games/shogi/ShogiGame';

interface GameInfo {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  Component: ComponentType<{ onBack(): void }>;
}

const GAMES: GameInfo[] = [
  { id: 'gomoku', name: '五目並べ', blurb: '5つ並べたら勝ち', icon: '●', Component: GomokuGame },
  { id: 'othello', name: 'オセロ', blurb: '挟んでひっくり返す', icon: '◐', Component: OthelloGame },
  { id: 'chess', name: 'チェス', blurb: 'キングを追い詰める', icon: '♞︎', Component: ChessGame },
  { id: 'shogi', name: '将棋', blurb: '取った駒を使える', icon: '将', Component: ShogiGame },
  { id: 'go', name: '囲碁', blurb: '9・13・19路盤', icon: '碁', Component: GoGame },
];

function currentRoute(): string {
  return location.hash.replace(/^#\/?/, '');
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const game = GAMES.find((g) => g.id === route);
  if (game) {
    const back = () => {
      if (history.length > 1 && history.state?.fromMenu) history.back();
      else location.hash = '';
    };
    return <game.Component key={game.id} onBack={back} />;
  }

  return (
    <div className="menu">
      <header className="menu-header">
        <h1>ボードゲーム箱</h1>
        <p>遊びたいゲームを選んでください</p>
      </header>
      <ul className="game-list">
        {GAMES.map((g) => (
          <li key={g.id}>
            <a
              className={`game-card card-${g.id}`}
              href={`#/${g.id}`}
              onClick={(e) => {
                e.preventDefault();
                history.pushState({ fromMenu: true }, '', `#/${g.id}`);
                setRoute(g.id);
              }}
            >
              <span className="game-icon" aria-hidden>
                {g.icon}
              </span>
              <span className="game-text">
                <strong>{g.name}</strong>
                <small>{g.blurb}</small>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="menu-foot">2人対戦・CPU対戦に対応。対局は自動で保存されます。</p>
    </div>
  );
}
