import React, { useState } from 'react';
import type { Territory } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { buildingMap } from '@data/buildings';
import BuildMenu from './BuildMenu';
import { getActualController } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { formatAmount } from '@ui/utils/formatAmount';
import TreasuryTransferModal from './TreasuryTransferModal';

interface TerritoryPanelProps {
  territory: Territory;
  onClose: () => void;
  onClickRuler?: (characterId: string) => void;
}

const TerritoryPanel: React.FC<TerritoryPanelProps> = ({ territory, onClose, onClickRuler }) => {
  const controllerId = getActualController(territory);
  const ruler = useCharacterStore((s) => controllerId ? s.characters.get(controllerId) : undefined);
  const dejureRuler = useCharacterStore((s) => {
    // dejureControllerId 指向父道ID，需要从道的主岗位找到法理控制者
    const dao = useTerritoryStore.getState().territories.get(territory.dejureControllerId);
    if (!dao) return undefined;
    const mainPost = dao.posts.find((p) =>
      p.templateId === 'pos-jiedushi' || p.templateId === 'pos-guancha-shi',
    );
    return mainPost?.holderId ? s.characters.get(mainPost.holderId) : undefined;
  });
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);
  const [buildSlotIndex, setBuildSlotIndex] = useState<number | null>(null);
  const [transferResource, setTransferResource] = useState<'money' | 'grain' | null>(null);
  const playerId = useCharacterStore((s) => s.playerId);
  const isPlayerTerritory = controllerId === playerId;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-accent-gold)]">{territory.name}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {territory.tier === 'zhou' ? '州' : territory.tier === 'dao' ? '道' : '国'}
              {' | '}
              {territory.territoryType === 'civil' ? '民政' : '军事'}
              {territory.tier === 'zhou' && (
                <>{' | '}户数 {territory.basePopulation.toLocaleString()}</>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Controllers */}
        <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">实际控制</div>
            <button
              className="text-[var(--color-accent-gold)] hover:underline"
              onClick={() => ruler && onClickRuler?.(ruler.id)}
            >
              {ruler?.name ?? '无'}
            </button>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">法理控制</div>
            <span className="text-[var(--color-text)]">{dejureRuler?.name ?? '无'}</span>
          </div>
        </div>

        {/* Content: dao/guo shows child territories; zhou shows attributes/buildings/armies */}
        {territory.tier !== 'zhou' ? (
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">下辖州 ({territory.childIds.length})</h3>
            <div className="space-y-1.5">
              {territory.childIds.map((childId) => {
                const child = territories.get(childId);
                if (!child) return null;
                const childControllerId = getActualController(child);
                const childRuler = childControllerId ? characters.get(childControllerId) : undefined;
                return (
                  <button
                    key={childId}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                    onClick={() => childRuler && onClickRuler?.(childRuler.id)}
                  >
                    <span className="text-sm text-[var(--color-accent-gold)] font-bold">{child.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{childRuler?.name ?? '无主'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Treasury */}
            {territory.treasury && (
              <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">国库金钱</div>
                  <div className="flex items-center gap-2">
                    <div className="text-[var(--color-accent-gold)] font-bold">{formatAmount(territory.treasury.money)}</div>
                    {isPlayerTerritory && (
                      <button
                        onClick={() => setTransferResource('money')}
                        className="text-xs px-1.5 py-0.5 rounded border border-[var(--color-accent-green,#27ae60)] text-[var(--color-accent-green,#27ae60)] hover:bg-[var(--color-accent-green,#27ae60)]/10 transition-colors"
                        title="调拨到其他州"
                      >
                        调拨
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">国库粮草</div>
                  <div className="flex items-center gap-2">
                    <div className="text-[var(--color-accent-gold)] font-bold">{formatAmount(territory.treasury.grain)}</div>
                    {isPlayerTerritory && (
                      <button
                        onClick={() => setTransferResource('grain')}
                        className="text-xs px-1.5 py-0.5 rounded border border-[var(--color-accent-green,#27ae60)] text-[var(--color-accent-green,#27ae60)] hover:bg-[var(--color-accent-green,#27ae60)]/10 transition-colors"
                        title="调拨到其他州"
                      >
                        调拨
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {transferResource && playerId && (
              <TreasuryTransferModal
                charId={playerId}
                lockedFromId={territory.id}
                lockedResource={transferResource}
                onClose={() => setTransferResource(null)}
              />
            )}

            {/* Three attributes */}
            <div className="mb-4">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">属性</h3>
              <div className="space-y-2">
                {[
                  { label: '控制度', value: territory.control, color: '#2980b9' },
                  { label: '发展度', value: territory.development, color: '#27ae60' },
                  { label: '民心', value: territory.populace, color: '#f39c12' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-0.5">
                      <span>{label}</span>
                      <span>{Math.floor(value)}/100</span>
                    </div>
                    <div className="w-full bg-[var(--color-bg)] rounded h-2.5">
                      <div className="h-2.5 rounded" style={{ width: `${value}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Buildings */}
            <div className="mb-4">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">
                建筑 ({territory.buildings.filter((b) => b.buildingId).length}/{territory.buildings.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {territory.buildings.map((slot, i) => {
                  const underConstruction = territory.constructions.find((c) => c.slotIndex === i);

                  if (underConstruction) {
                    const consDef = buildingMap.get(underConstruction.buildingId);
                    return (
                      <div key={i} className="border border-[var(--color-accent-blue,#3498db)] bg-[var(--color-bg-surface)]/30 rounded px-2 py-1.5 text-xs">
                        <div className="text-[var(--color-text)] font-bold">{consDef?.name ?? underConstruction.buildingId}</div>
                        <div className="text-[var(--color-text-muted)]">施工中 剩余{underConstruction.remainingMonths}月</div>
                      </div>
                    );
                  }

                  if (!slot.buildingId) {
                    if (isPlayerTerritory) {
                      return (
                        <button
                          key={i}
                          onClick={() => setBuildSlotIndex(i)}
                          className="border border-dashed border-[var(--color-accent-gold)]/50 rounded px-2 py-1.5 text-xs text-[var(--color-text-muted)] text-center cursor-pointer hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors"
                        >
                          ＋ 建造
                        </button>
                      );
                    }
                    return (
                      <div key={i} className="border border-dashed border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-muted)] text-center">
                        空槽
                      </div>
                    );
                  }

                  const def = buildingMap.get(slot.buildingId);
                  const isMaxLevel = slot.level >= (def?.maxLevel ?? 3);

                  if (isMaxLevel) {
                    return (
                      <div key={i} className="border border-[var(--color-border)] rounded px-2 py-1.5 text-xs">
                        <span className="text-[var(--color-text)] font-bold">{def?.name ?? slot.buildingId}</span>
                        <span className="text-[var(--color-text-muted)] ml-1">Lv.{slot.level}</span>
                        <span className="text-[var(--color-accent-green,#27ae60)] ml-1">满级</span>
                      </div>
                    );
                  }

                  if (isPlayerTerritory) {
                    return (
                      <button
                        key={i}
                        onClick={() => setBuildSlotIndex(i)}
                        className="border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-left cursor-pointer hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors w-full"
                      >
                        <span className="text-[var(--color-text)] font-bold">{def?.name ?? slot.buildingId}</span>
                        <span className="text-[var(--color-text-muted)] ml-1">Lv.{slot.level}</span>
                        <span className="text-[var(--color-accent-gold,#f39c12)] ml-1">可升级</span>
                      </button>
                    );
                  }

                  return (
                    <div key={i} className="border border-[var(--color-border)] rounded px-2 py-1.5 text-xs">
                      <span className="text-[var(--color-text)] font-bold">{def?.name ?? slot.buildingId}</span>
                      <span className="text-[var(--color-text-muted)] ml-1">Lv.{slot.level}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {buildSlotIndex !== null && (
              <BuildMenu
                territory={territory}
                slotIndex={buildSlotIndex}
                onClose={() => setBuildSlotIndex(null)}
              />
            )}

            {/* 驻军 */}
            {(() => {
              const { armies: milArmies, battalions: milBattalions } = useMilitaryStore.getState();
              const localArmies = Array.from(milArmies.values()).filter((a) => a.locationId === territory.id);
              const totalTroops = localArmies.reduce((s, a) => s + getArmyStrength(a, milBattalions), 0);
              return (
                <div>
                  <div className="text-sm text-[var(--color-text-muted)] mb-1">
                    驻军: <span className="text-[var(--color-text)] font-bold">{totalTroops.toLocaleString()}人</span>
                    {localArmies.length > 0 && <span>（{localArmies.length}军）</span>}
                  </div>
                  {localArmies.length > 0 && (
                    <div className="space-y-0.5">
                      {localArmies.map((a) => {
                        const strength = getArmyStrength(a, milBattalions);
                        const commander = a.commanderId ? useCharacterStore.getState().getCharacter(a.commanderId) : undefined;
                        return (
                          <div key={a.id} className="text-xs text-[var(--color-text-muted)] pl-2">
                            {a.name} · {strength.toLocaleString()}人{commander ? ` · ${commander.name}` : ''}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 占领状态 */}
            {territory.occupiedBy && (() => {
              const occupier = useCharacterStore.getState().getCharacter(territory.occupiedBy);
              return (
                <div className="mt-2 px-2 py-1.5 rounded border border-[var(--color-accent-red,#e74c3c)] bg-[var(--color-accent-red,#e74c3c)]/10">
                  <div className="text-xs font-bold text-[var(--color-accent-red,#e74c3c)]">
                    被占领
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    占领者：{occupier?.name ?? '未知'}
                  </div>
                </div>
              );
            })()}

            {/* 围城状态 */}
            {(() => {
              const siege = Array.from(useWarStore.getState().sieges.values()).find((s) => s.territoryId === territory.id);
              if (!siege) return null;
              const campaign = useWarStore.getState().campaigns.get(siege.campaignId);
              const attackerName = campaign ? useCharacterStore.getState().getCharacter(campaign.ownerId)?.name : '未知';
              return (
                <div className="mt-2 px-2 py-1.5 rounded border border-[var(--color-accent-red,#e74c3c)] bg-[var(--color-accent-red,#e74c3c)]/10">
                  <div className="text-xs font-bold text-[var(--color-accent-red,#e74c3c)]">
                    正在被围攻！
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    攻方：{attackerName} · 进度 {Math.floor(siege.progress)}%
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-[var(--color-bg-surface)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-accent-red,#e74c3c)]"
                      style={{ width: `${Math.floor(siege.progress)}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default TerritoryPanel;
