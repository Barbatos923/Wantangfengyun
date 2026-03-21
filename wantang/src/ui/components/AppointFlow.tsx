import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getAppointablePositions, executeAppoint } from '@engine/interaction';
import { canAppoint, canGrantTerritory } from '@engine/official/officialUtils';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';

interface AppointFlowProps {
  targetId: string;
  onClose: () => void;
}

/**
 * 判断选中职位是否需要领地选择步骤，以及需要选什么层级的领地。
 * - pos-cishi → 选州（且需要canGrantTerritory校验）
 * - superiorPositionId === 'pos-jiedushi' → 选道（从玩家的节度使持有中）
 * - superiorPositionId === 'pos-cishi' → 选州（从玩家的刺史持有中）
 * - 其他 → 不需要选领地
 */
function getTerritoryRequirement(positionId: string): 'zhou-grant' | 'dao' | 'zhou' | null {
  if (positionId === 'pos-cishi') return 'zhou-grant';
  const def = positionMap.get(positionId);
  if (!def) return null;
  if (def.superiorPositionId === 'pos-jiedushi') return 'dao';
  if (def.superiorPositionId === 'pos-cishi') return 'zhou';
  return null;
}

export default function AppointFlow({ targetId, onClose }: AppointFlowProps) {
  const [step, setStep] = useState<'position' | 'territory'>('position');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);

  if (!player || !target) return null;

  // ── Step 1: Position selection ──

  function renderPositionStep() {
    const appointableIds = getAppointablePositions(player!);

    return (
      <div className="flex flex-col gap-2">
        {appointableIds.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-4">暂无可任命职位</p>
        )}
        {appointableIds.map((positionId) => {
          const posDef = positionMap.get(positionId);
          if (!posDef) return null;

          const rankDef = rankMap.get(posDef.minRank);
          const rankLabel = rankDef?.name ?? `${posDef.minRank}`;

          const check = canAppoint(player!, target!, positionId, characters);
          const disabled = !check.ok;
          const reason = check.reason;

          return (
            <button
              key={positionId}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                const terrReq = getTerritoryRequirement(positionId);
                if (terrReq) {
                  setSelectedPositionId(positionId);
                  setStep('territory');
                } else {
                  executeAppoint(player!.id, targetId, positionId);
                  onClose();
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded border text-left transition-colors ${
                disabled
                  ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                  : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] cursor-pointer'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-[var(--color-text)]">{posDef.name}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{posDef.institution}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="text-xs text-[var(--color-text-muted)]">品 {rankLabel}</span>
                {reason && (
                  <span className="text-xs text-[var(--color-accent-red)]">{reason}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Step 2: Territory selection ──

  function renderTerritoryStep() {
    const terrReq = selectedPositionId ? getTerritoryRequirement(selectedPositionId) : null;

    // 根据类型收集可选领地
    let candidateTerritories: { id: string; name: string; disabled: boolean; reason?: string }[] = [];

    if (terrReq === 'zhou-grant') {
      // 刺史：从玩家直辖的zhou中选，需canGrantTerritory校验
      for (const tid of player!.controlledTerritoryIds) {
        const t = territories.get(tid);
        if (!t || t.tier !== 'zhou') continue;
        const check = canGrantTerritory(player!, tid, territories);
        candidateTerritories.push({ id: tid, name: t.name, disabled: !check.ok, reason: check.reason });
      }
    } else if (terrReq === 'dao') {
      // 藩镇幕府职位：从玩家持有的节度使职位中列出关联的道
      if (player!.official) {
        for (const h of player!.official.positions) {
          if (h.positionId !== 'pos-jiedushi' || !h.territoryId) continue;
          const t = territories.get(h.territoryId);
          if (!t) continue;
          const checkResult = canAppoint(player!, target!, selectedPositionId!, characters, h.territoryId);
          candidateTerritories.push({
            id: t.id, name: t.name,
            disabled: !checkResult.ok && checkResult.reason === '已有人在任',
            reason: !checkResult.ok && checkResult.reason === '已有人在任' ? '已有人在任' : undefined,
          });
        }
      }
    } else if (terrReq === 'zhou') {
      // 州府职位：从玩家持有的刺史职位中列出关联的州
      if (player!.official) {
        for (const h of player!.official.positions) {
          if (h.positionId !== 'pos-cishi' || !h.territoryId) continue;
          const t = territories.get(h.territoryId);
          if (!t) continue;
          const checkResult = canAppoint(player!, target!, selectedPositionId!, characters, h.territoryId);
          candidateTerritories.push({
            id: t.id, name: t.name,
            disabled: !checkResult.ok && checkResult.reason === '已有人在任',
            reason: !checkResult.ok && checkResult.reason === '已有人在任' ? '已有人在任' : undefined,
          });
        }
      }
    }

    return (
      <>
        <button
          onClick={() => setStep('position')}
          className="text-sm text-[var(--color-accent-gold)] hover:underline mb-2"
        >
          ← 返回
        </button>

        <div className="flex flex-col gap-2">
          {candidateTerritories.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">无可选领地</p>
          )}
          {candidateTerritories.map((ct) => (
            <button
              key={ct.id}
              disabled={ct.disabled}
              onClick={() => {
                if (ct.disabled) return;
                executeAppoint(player!.id, targetId, selectedPositionId!, ct.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded border text-left transition-colors ${
                ct.disabled
                  ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                  : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] cursor-pointer'
              }`}
            >
              <span className="text-sm font-bold text-[var(--color-text)]">{ct.name}</span>
              {ct.reason && (
                <span className="text-xs text-[var(--color-accent-red)] shrink-0">{ct.reason}</span>
              )}
            </button>
          ))}
        </div>
      </>
    );
  }

  // ── Layout ──

  const posDef = selectedPositionId ? positionMap.get(selectedPositionId) : null;
  const stepTitle = step === 'position'
    ? `任命 ${target.name}`
    : `选择${posDef?.name ?? '职位'}所属领地`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl max-h-[80vh] flex flex-col gap-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-accent-gold)]">{stepTitle}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">×</button>
        </div>
        {step === 'position' ? renderPositionStep() : renderTerritoryStep()}
      </div>
    </div>
  );
}
