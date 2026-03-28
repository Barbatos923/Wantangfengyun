import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { refreshPlayerLedger } from '@engine/interaction';
import { positionMap } from '@data/positions';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import type { CentralizationLevel } from '@engine/territory/types';
import type { Post } from '@engine/territory/types';

// 军/民模板切换映射
const MILITARY_TO_CIVIL: Record<string, string> = {
  'pos-jiedushi': 'pos-guancha-shi',
  'pos-fangyu-shi': 'pos-cishi',
};
const CIVIL_TO_MILITARY: Record<string, string> = {
  'pos-guancha-shi': 'pos-jiedushi',
  'pos-cishi': 'pos-fangyu-shi',
};

// 集权等级 → 好感修正：1级=+10, 2级=0, 3级=-10, 4级=-20
const CENTRALIZATION_OPINION: Record<number, number> = { 1: 10, 2: 0, 3: -10, 4: -20 };

const TAX_LEVEL_LABELS: Record<number, string> = { 1: '放任', 2: '一般', 3: '严控', 4: '压榨' };

interface CentralizationFlowProps {
  targetId: string;
  onClose: () => void;
}

const CentralizationFlow: React.FC<CentralizationFlowProps> = ({ targetId, onClose }) => {
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const playerId = useCharacterStore((s) => s.playerId);
  const charStore = useCharacterStore;
  const territories = useTerritoryStore((s) => s.territories);

  if (!target) { onClose(); return null; }

  const currentLevel = target.centralization ?? 2;

  // ── 赋税等级 ──
  const handleTaxChange = (delta: number) => {
    const newLevel = Math.max(1, Math.min(4, currentLevel + delta)) as CentralizationLevel;
    if (newLevel === currentLevel) return;
    const store = charStore.getState();
    store.updateCharacter(targetId, { centralization: newLevel });
    if (playerId) {
      store.setOpinion(targetId, playerId, {
        reason: '赋税等级',
        value: CENTRALIZATION_OPINION[newLevel] ?? 0,
        decayable: false,
      });
    }
    refreshPlayerLedger();
  };

  // ── 查找 target 持有的 grantsControl 岗位 ──
  const controlPosts: Array<{
    post: Post;
    territoryId: string;
    territoryName: string;
    tier: string;
    capitalZhouId?: string;
  }> = [];
  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== targetId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      controlPosts.push({
        post,
        territoryId: terr.id,
        territoryName: terr.name,
        tier: terr.tier,
        capitalZhouId: terr.capitalZhouId,
      });
    }
  }

  // ── 玩家是否能设置某领地岗位的辟署权 ──
  // 规则：玩家在该领地的父领地链上持有辟署权
  function playerCanSetAppointRight(territoryId: string): boolean {
    if (!playerId) return false;
    const terr = territories.get(territoryId);
    let parentId = terr?.parentId;
    while (parentId) {
      const parent = territories.get(parentId);
      if (!parent) return false;
      const appointPost = parent.posts.find(p => p.hasAppointRight && p.holderId === playerId);
      if (appointPost) return true;
      parentId = parent.parentId;
    }
    return false;
  }

  // ── 职类变更 ──
  const handleToggleType = (entry: typeof controlPosts[0]) => {
    const terrStore = useTerritoryStore.getState();
    const { post, territoryId } = entry;
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return;
    const isMilitary = tpl.territoryType === 'military';
    const newTemplateId = isMilitary
      ? MILITARY_TO_CIVIL[post.templateId]
      : CIVIL_TO_MILITARY[post.templateId];
    if (!newTemplateId) return;
    const newType = isMilitary ? 'civil' as const : 'military' as const;
    terrStore.updatePost(post.id, { templateId: newTemplateId });
    terrStore.updateTerritory(territoryId, { territoryType: newType });
    const terr = terrStore.getTerritory(territoryId);
    if (terr && terr.tier === 'dao' && terr.childIds) {
      for (const childId of terr.childIds) {
        terrStore.updateTerritory(childId, { territoryType: newType });
      }
    }
    refreshPlayerLedger();
  };

  // ── 继承法切换 ──
  const handleToggleSuccession = (entry: typeof controlPosts[0]) => {
    const terrStore = useTerritoryStore.getState();
    const { post, capitalZhouId } = entry;
    const newLaw = post.successionLaw === 'clan' ? 'bureaucratic' as const : 'clan' as const;
    const patch: Partial<Post> = { successionLaw: newLaw };
    if (newLaw === 'bureaucratic') patch.designatedHeirId = null; // 流官无继承人
    terrStore.updatePost(post.id, patch);
    // 治所联动
    if (capitalZhouId) {
      const capZhou = territories.get(capitalZhouId);
      const capPost = capZhou?.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
      if (capPost) terrStore.updatePost(capPost.id, patch);
    }
  };

  // ── 辟署权切换 ──
  const handleToggleAppointRight = (entry: typeof controlPosts[0]) => {
    const terrStore = useTerritoryStore.getState();
    terrStore.updatePost(entry.post.id, { hasAppointRight: !entry.post.hasAppointRight });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-md w-full mx-4 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-bold text-[var(--color-accent-gold)]">
            调整对 {target.name} 的权责
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {/* ===== 赋税等级 ===== */}
          <div className="flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">赋税等级</span>
            <div className="flex items-center gap-2">
              <button
                className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentLevel <= 1}
                onClick={() => handleTaxChange(-1)}
              >−</button>
              <span className="text-sm font-bold text-[var(--color-accent-gold)] w-16 text-center">
                {currentLevel}级 {TAX_LEVEL_LABELS[currentLevel] ?? ''}
              </span>
              <button
                className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentLevel >= 4}
                onClick={() => handleTaxChange(1)}
              >+</button>
            </div>
          </div>

          {/* ===== 岗位设置（职类 + 继承法 + 辟署权） ===== */}
          {controlPosts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5">岗位设置</h4>
              <div className="space-y-1.5">
                {controlPosts.map((entry) => {
                  const tpl = positionMap.get(entry.post.templateId);
                  const isMilitary = tpl?.territoryType === 'military';
                  const canToggleType = isMilitary
                    ? !!MILITARY_TO_CIVIL[entry.post.templateId]
                    : !!CIVIL_TO_MILITARY[entry.post.templateId];
                  const isClan = entry.post.successionLaw === 'clan';
                  const canToggleAppoint = entry.post.territoryId
                    ? playerCanSetAppointRight(entry.post.territoryId)
                    : false;

                  return (
                    <div
                      key={entry.post.id}
                      className="px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                    >
                      {/* 岗位名称 */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--color-text)]">{entry.territoryName}</span>
                          <span className="text-xs text-[var(--color-text-muted)] ml-1.5">{tpl?.name ?? ''}</span>
                        </div>
                      </div>
                      {/* 按钮行 */}
                      <div className="flex flex-wrap gap-1.5">
                        {/* 职类 */}
                        {canToggleType && (
                          <button
                            onClick={() => handleToggleType(entry)}
                            className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                              isMilitary
                                ? 'border-blue-400/50 text-blue-400 hover:bg-blue-400/10'
                                : 'border-red-400/50 text-red-400 hover:bg-red-400/10'
                            }`}
                          >
                            转为{isMilitary ? '民政' : '军事'}
                          </button>
                        )}
                        {/* 继承法 */}
                        <button
                          onClick={() => handleToggleSuccession(entry)}
                          className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                            isClan
                              ? 'border-amber-400/50 text-amber-400 hover:bg-amber-400/10'
                              : 'border-cyan-400/50 text-cyan-400 hover:bg-cyan-400/10'
                          }`}
                        >
                          {isClan ? '世袭 → 流官' : '流官 → 世袭'}
                        </button>
                        {/* 辟署权 */}
                        {canToggleAppoint && (
                          <button
                            onClick={() => handleToggleAppointRight(entry)}
                            className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                              entry.post.hasAppointRight
                                ? 'border-purple-400/50 text-purple-400 hover:bg-purple-400/10'
                                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-purple-400 hover:border-purple-400/50'
                            }`}
                          >
                            {entry.post.hasAppointRight ? '收回辟署权' : '授予辟署权'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CentralizationFlow;
