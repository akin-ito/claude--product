import { useEffect, useState } from 'react';
import { Segmented } from '../components/GameShell';
import { chessRules } from './content/chess';
import { goRules } from './content/go';
import { gomokuRules } from './content/gomoku';
import { othelloRules } from './content/othello';
import { shogiRules } from './content/shogi';
import type { RulesContent } from './types';

const CONTENT: Record<string, RulesContent> = {
  gomoku: gomokuRules,
  othello: othelloRules,
  chess: chessRules,
  shogi: shogiRules,
  go: goRules,
};

type Tab = 'beginner' | 'rulebook';

export function RulesPage({ gameId, name, onBack, onPlay }: { gameId: string; name: string; onBack(): void; onPlay(): void }) {
  const [tab, setTab] = useState<Tab>('beginner');
  const content = CONTENT[gameId];

  useEffect(() => window.scrollTo(0, 0), [tab]);

  return (
    <div className="rules">
      <header className="topbar rules-topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          ‹
        </button>
        <div className="topbar-title">
          <h1>{name}のルール</h1>
        </div>
        <span className="icon-btn-spacer" />
      </header>
      <div className="rules-tabs">
        <Segmented<Tab>
          value={tab}
          options={[
            ['beginner', 'はじめての人へ'],
            ['rulebook', 'ルールブック'],
          ]}
          onChange={setTab}
        />
      </div>
      <article className="rules-body">{tab === 'beginner' ? content.beginner : content.rulebook}</article>
      <div className="rules-foot">
        {tab === 'beginner' && (
          <button onClick={() => setTab('rulebook')}>詳しいルールを読む</button>
        )}
        <button className="primary" onClick={onPlay}>
          {name}で遊ぶ
        </button>
      </div>
    </div>
  );
}
