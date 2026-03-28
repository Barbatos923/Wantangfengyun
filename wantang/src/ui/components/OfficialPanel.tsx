import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import type { Character } from '@engine/character/types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getRankTitle, calculateSalary, getDynamicTitle, getHeldPosts, getControlledZhou } from '@engine/official/officialUtils';
import { isVassalOf } from '@engine/character/successionUtils';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { usePanelStore } from '@ui/stores/panelStore';
import { useTurnManager } from '@engine/TurnManager';
import type { Post } from '@engine/territory/types';

interface OfficialPanelProps {
  onClose: () => void;
}

type TabKey = 'status' | 'roster';

/** 获取指定继承人的候选人列表（子嗣 + 同族附庸） */
function getHeirCandidates(
  playerId: string,
  characters: Map<string, Character>,
): { char: Character; label: string }[] {
  const player = characters.get(playerId);
  if (!player) return [];
  const result: { char: Character; label: string }[] = [];

  // 1. 子嗣
  for (const cid of player.family.childrenIds) {
    const c = characters.get(cid);
    if (c?.alive) result.push({ char: c, label: '子嗣' });
  }

  // 2. 同族附庸（排除已加入的子嗣）
  const childSet = new Set(player.family.childrenIds);
  for (const c of characters.values()) {
    if (!c.alive || c.id === playerId || childSet.has(c.id)) continue;
    if (c.clan !== player.clan) continue;
    if (isVassalOf(c.id, playerId, characters)) {
      result.push({ char: c, label: '族人' });
    }
  }

  // 按年龄降序（birthYear 升序 = 最年长优先）
  result.sort((a, b) => a.char.birthYear - b.char.birthYear);
  return result;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'status', label: '我的官职' },
  { key: 'roster', label: '官署' },
];

const OfficialPanel: React.FC<OfficialPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('status');
  const [heirPickerPost, setHeirPickerPost] = useState<Post | null>(null);

  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => (playerId ? s.characters.get(playerId) : undefined));
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);

  // ── Tab 1 helpers ──────────────────────────────────────────────────────────
  const heldPosts = player ? getHeldPosts(player.id) : [];
  const isEmperor = heldPosts.some((p) => p.templateId === 'pos-emperor');
  const rankTitle = player ? getRankTitle(player) : '';
  const rankDef = player?.official ? rankMap.get(player.official.rankLevel) : undefined;
  const virtue = player?.official?.virtue ?? 0;
  const nextRankDef = player?.official ? rankMap.get(player.official.rankLevel + 1) : undefined;
  const nextThreshold = nextRankDef?.virtueThreshold ?? rankDef?.virtueThreshold ?? 1;
  const virtueProgress = Math.min(1, nextThreshold > 0 ? virtue / nextThreshold : 1);
  const salary = player ? calculateSalary(player) : { money: 0, grain: 0 };

  // ── Tab 3 helpers: 官署（效忠于玩家的角色，按有地/无地分组）──
  const vassalsWithLand: Character[] = [];
  const vassalsWithoutLand: Character[] = [];

  if (player) {
    for (const c of characters.values()) {
      if (!c.alive || c.overlordId !== player.id) continue;
      if (getControlledZhou(c.id, territories).length > 0) {
        vassalsWithLand.push(c);
      } else {
        vassalsWithoutLand.push(c);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold text-[var(--color-accent-gold)]">官职</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] mb-4 shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 text-sm font-bold transition-colors ${
                activeTab === key
                  ? 'text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* Tab 1: 我的官职 */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {!player?.official ? (
                <p className="text-center text-[var(--color-text-muted)] py-4 text-sm">无官职</p>
              ) : (
                <>
                  {/* Rank */}
                  <div className="px-3 py-3 rounded border border-[var(--color-border)]">
                    <div className="text-xs text-[var(--color-text-muted)] mb-1">品位</div>
                    <div className="text-sm font-bold text-[var(--color-text)]">
                      {isEmperor ? 'N/A' : (
                        <>
                          {rankTitle}
                          {rankDef && (
                            <span className="text-[var(--color-text-muted)] font-normal ml-1">
                              （{rankDef.name}）
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Virtue progress */}
                  <div className="px-3 py-3 rounded border border-[var(--color-border)]">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[var(--color-text-muted)]">贤能</span>
                      <span className="text-[var(--color-text)]">
                        {isEmperor ? 'N/A' : `${Math.floor(virtue)}/${nextThreshold}`}
                      </span>
                    </div>
                    {!isEmperor && (
                      <div className="h-2.5 w-full bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent-gold)] transition-all"
                          style={{ width: `${virtueProgress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Positions */}
                  <div>
                    <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">
                      担任职位
                    </h3>
                    {heldPosts.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)] px-1">暂无差遣</p>
                    ) : (
                      <div className="space-y-1.5">
                        {heldPosts.map((post, idx) => {
                          const posDef = positionMap.get(post.templateId);
                          if (!posDef) return null;
                          const territoryName = post.territoryId
                            ? territories.get(post.territoryId)?.name
                            : undefined;
                          const isClan = post.successionLaw === 'clan';
                          const heirChar = post.designatedHeirId ? characters.get(post.designatedHeirId) : undefined;
                          const heirAlive = heirChar?.alive;
                          // 治所州主岗：由道级联动，继承人只读
                          const isCapitalZhou = !!(post.territoryId && posDef.grantsControl
                            && Array.from(territories.values()).some(t => t.tier === 'dao' && t.capitalZhouId === post.territoryId));
                          // 道级岗位：找到其治所州主岗 ID，用于联动
                          const daoTerr = post.territoryId ? territories.get(post.territoryId) : undefined;
                          const capitalPostId = (daoTerr?.tier === 'dao' && daoTerr.capitalZhouId && posDef.grantsControl)
                            ? territories.get(daoTerr.capitalZhouId)?.posts.find(p => positionMap.get(p.templateId)?.grantsControl)?.id
                            : undefined;
                          return (
                            <div
                              key={idx}
                              className="px-3 py-2 rounded border border-[var(--color-border)]"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-bold text-[var(--color-text)] truncate">
                                    {posDef.name}
                                  </span>
                                  <span className="text-xs text-[var(--color-text-muted)]">
                                    {posDef.institution}
                                    {territoryName && ` · ${territoryName}`}
                                  </span>
                                </div>
                                {isClan && isCapitalZhou && heirAlive && (
                                  <span className="text-xs px-2 py-0.5 rounded border shrink-0 ml-2 text-[var(--color-text-muted)] border-[var(--color-border)]">
                                    继承人: {heirChar!.name}（随道级）
                                  </span>
                                )}
                                {isClan && !isCapitalZhou && (
                                  <button
                                    className={`text-xs px-2 py-0.5 rounded border shrink-0 ml-2 transition-colors ${
                                      heirAlive
                                        ? 'text-[var(--color-accent-gold)] border-[var(--color-accent-gold)]/40 hover:bg-[var(--color-accent-gold)]/10'
                                        : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]'
                                    }`}
                                    onClick={() => setHeirPickerPost(heirPickerPost?.id === post.id ? null : post)}
                                  >
                                    {heirAlive ? `继承人: ${heirChar!.name}` : '指定继承人'}
                                  </button>
                                )}
                              </div>
                              {/* 继承人选人面板 */}
                              {heirPickerPost?.id === post.id && player && (
                                <HeirPicker
                                  post={post}
                                  playerId={player.id}
                                  characters={characters}
                                  currentDate={undefined}
                                  onSelect={(charId) => {
                                    const ts = useTerritoryStore.getState();
                                    ts.updatePost(post.id, { designatedHeirId: charId });
                                    if (capitalPostId) ts.updatePost(capitalPostId, { designatedHeirId: charId });
                                    setHeirPickerPost(null);
                                  }}
                                  onClear={() => {
                                    const ts = useTerritoryStore.getState();
                                    ts.updatePost(post.id, { designatedHeirId: null });
                                    if (capitalPostId) ts.updatePost(capitalPostId, { designatedHeirId: null });
                                    setHeirPickerPost(null);
                                  }}
                                  onClose={() => setHeirPickerPost(null)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Salary */}
                  <div className="px-3 py-2 rounded border border-[var(--color-border)] flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-muted)]">月俸</span>
                    <span className="text-sm text-[var(--color-text)]">
                      钱{Math.floor(salary.money)}&nbsp;
                      粮{Math.floor(salary.grain)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 2: 官署 */}
          {activeTab === 'roster' && (
            <div className="space-y-4">
              {vassalsWithLand.length === 0 && vassalsWithoutLand.length === 0 ? (
                <p className="text-center text-[var(--color-text-muted)] py-4 text-sm">暂无效忠者</p>
              ) : (
                <>
                  {vassalsWithLand.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 px-1">有地 ({vassalsWithLand.length})</h3>
                      <div className="space-y-1">
                        {vassalsWithLand.map((c) => (
                          <button
                            key={c.id}
                            className="w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                            onClick={() => {
                              usePanelStore.getState().pushCharacter(c.id);
                              onClose();
                            }}
                          >
                            <div className="flex flex-col min-w-0 mr-2">
                              <span className="text-sm font-bold text-[var(--color-text)] truncate">{c.name}</span>
                              <span className="text-xs text-[var(--color-text-muted)]">{getDynamicTitle(c, territories)}</span>
                            </div>
                            <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                              {c.official ? rankMap.get(c.official.rankLevel)?.name ?? '' : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {vassalsWithoutLand.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 px-1">无地 ({vassalsWithoutLand.length})</h3>
                      <div className="space-y-1">
                        {vassalsWithoutLand.map((c) => (
                          <button
                            key={c.id}
                            className="w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                            onClick={() => {
                              usePanelStore.getState().pushCharacter(c.id);
                              onClose();
                            }}
                          >
                            <div className="flex flex-col min-w-0 mr-2">
                              <span className="text-sm font-bold text-[var(--color-text)] truncate">{c.name}</span>
                              <span className="text-xs text-[var(--color-text-muted)]">{getDynamicTitle(c, territories)}</span>
                            </div>
                            <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                              {c.official ? rankMap.get(c.official.rankLevel)?.name ?? '' : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

/** 继承人选人内联面板 */
const HeirPicker: React.FC<{
  post: Post;
  playerId: string;
  characters: Map<string, Character>;
  currentDate: undefined;
  onSelect: (charId: string) => void;
  onClear: () => void;
  onClose: () => void;
}> = ({ post, playerId, characters, onSelect, onClear, onClose }) => {
  const candidates = getHeirCandidates(playerId, characters);
  const currentYear = useTurnManager((s) => s.currentDate.year);

  return (
    <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
      {candidates.length === 0 ? (
        <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无可立之人</div>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {candidates.map(({ char, label }) => (
            <button
              key={char.id}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors text-xs ${
                post.designatedHeirId === char.id
                  ? 'bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/40'
                  : 'hover:bg-[var(--color-bg)] border border-transparent'
              }`}
              onClick={() => onSelect(char.id)}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--color-text)]">{char.name}</span>
                <span className="text-[var(--color-text-muted)]">{label}</span>
              </div>
              <span className="text-[var(--color-text-muted)]">
                {currentYear - char.birthYear}岁
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        {post.designatedHeirId && (
          <button
            className="flex-1 text-xs py-1 rounded border border-[var(--color-accent-red)]/40 text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors"
            onClick={onClear}
          >
            取消指定
          </button>
        )}
        <button
          className="flex-1 text-xs py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
};

export default OfficialPanel;
