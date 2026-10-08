import type { ReactNode } from 'react';

export interface RulesContent {
  /** はじめての人向けのガイド */
  beginner: ReactNode;
  /** 細かいルールまで含めたルールブック */
  rulebook: ReactNode;
}
