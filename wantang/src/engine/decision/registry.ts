// ===== 决议注册表 =====

import type { Decision } from './types';

const decisions: Decision[] = [];

export function registerDecision(d: Decision): void {
  decisions.push(d);
}

export function getAvailableDecisions(actorId: string): Decision[] {
  return decisions.filter(d => d.canShow(actorId));
}

export function getAllDecisions(): Decision[] {
  return decisions;
}

export function getDecision(id: string): Decision | undefined {
  return decisions.find(d => d.id === id);
}
