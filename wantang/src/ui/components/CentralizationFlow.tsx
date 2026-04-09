import { Modal, ModalHeader } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import {
  executeTaxChange,
  executeToggleType,
  executeToggleSuccession,
  executeToggleAppointRight,
} from '@engine/interaction';
import { positionMap } from '@data/positions';
import { hasAuthorityOverPost, isCapitalZhouOfDao } from '@engine/npc/policyCalc';

import type { Post } from '@engine/territory/types';

const TAX_LEVEL_LABELS: Record<number, string> = { 1: '放任', 2: '一般', 3: '严控', 4: '压榨' };

interface CentralizationFlowProps {
  targetId: string;
  onClose: () => void;
}

const CentralizationFlow: React.FC<CentralizationFlowProps> = ({ targetId, onClose }) => {
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const playerId = useCharacterStore((s) => s.playerId);
  const territories = useTerritoryStore((s) => s.territories);

  if (!target) { onClose(); return null; }

  const currentLevel = target.centralization ?? 2;

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
      // 治所州主岗不是独立政策目标，由父道主岗联动
      if (isCapitalZhouOfDao(terr.id, territories)) continue;
      controlPosts.push({
        post,
        territoryId: terr.id,
        territoryName: terr.name,
        tier: terr.tier,
        capitalZhouId: terr.capitalZhouId,
      });
    }
  }

  // ── 玩家是否能设置某领地岗位的辟署权/继承法/职类 ──
  function playerCanSetPolicy(territoryId: string): boolean {
    if (!playerId) return false;
    return hasAuthorityOverPost(playerId, territoryId, territories);
  }

  return (
    <Modal size="md" onOverlayClick={onClose}>
      <ModalHeader title={`调整对 ${target.name} 的权责`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* ===== 赋税等级 ===== */}
          <div className="flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">赋税等级</span>
            <div className="flex items-center gap-2">
              <button
                className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentLevel <= 1}
                onClick={() => playerId && executeTaxChange(targetId, playerId, -1)}
              >−</button>
              <span className="text-sm font-bold text-[var(--color-accent-gold)] w-16 text-center">
                {currentLevel}级 {TAX_LEVEL_LABELS[currentLevel] ?? ''}
              </span>
              <button
                className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentLevel >= 4}
                onClick={() => playerId && executeTaxChange(targetId, playerId, 1)}
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
                    ? !!({ 'pos-jiedushi': true, 'pos-fangyu-shi': true } as Record<string, boolean>)[entry.post.templateId]
                    : !!({ 'pos-guancha-shi': true, 'pos-cishi': true } as Record<string, boolean>)[entry.post.templateId];
                  const isClan = entry.post.successionLaw === 'clan';
                  const canSetPolicy = entry.post.territoryId
                    ? playerCanSetPolicy(entry.post.territoryId)
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
                        {canToggleType && canSetPolicy && (
                          <button
                            onClick={() => executeToggleType(entry.post.id)}
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
                        {canSetPolicy && <button
                          onClick={() => executeToggleSuccession(entry.post.id)}
                          className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                            isClan
                              ? 'border-amber-400/50 text-amber-400 hover:bg-amber-400/10'
                              : 'border-cyan-400/50 text-cyan-400 hover:bg-cyan-400/10'
                          }`}
                        >
                          {isClan ? '世袭 → 流官' : '流官 → 世袭'}
                        </button>}
                        {/* 辟署权 */}
                        {canSetPolicy && (
                          <button
                            onClick={() => executeToggleAppointRight(entry.post.id)}
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
    </Modal>
  );
};

export default CentralizationFlow;
