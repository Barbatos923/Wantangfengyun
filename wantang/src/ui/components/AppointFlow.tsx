// ===== 任命职位流程（层级折叠 + 状态显示）=====

import { useState, useMemo } from 'react';
import { Modal, ModalHeader } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getAppointablePosts, executeAppoint } from '@engine/interaction';
import { canAppointToPost } from '@engine/official/officialUtils';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';
import { childInstitutions } from '@data/institutions';
import { getEffectiveMinRank } from '@engine/official/selectionUtils';
import type { Post, Territory } from '@engine/territory/types';
import type { Institution } from '@engine/official/types';
import { getTransferableChildren } from '@engine/official/postTransfer';
import type { TransferableChild } from '@engine/official/postTransfer';
import TransferChildrenFlow from './TransferChildrenFlow';

// ── 一级机构显示顺序（六部作为尚书省子机构，不单独列出）──
const INSTITUTION_ORDER: Institution[] = [
  '中书门下', '翰林院', '枢密院', '神策军',
  '三司', '中书省', '门下省', '尚书省',
  '御史台', '秘书省', '三公',
];

interface AppointFlowProps {
  targetId: string;
  onClose: () => void;
}

export default function AppointFlow({ targetId, onClose }: AppointFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);

  const [activeTab, setActiveTab] = useState<'local' | 'central'>('local');
  const [expandedGuos, setExpandedGuos] = useState<Set<string>>(new Set());
  const [expandedDaos, setExpandedDaos] = useState<Set<string>>(new Set());
  const [expandedInsts, setExpandedInsts] = useState<Set<string>>(new Set());
  // 法理下级转移弹窗
  const [transferState, setTransferState] = useState<{
    newHolderId: string;
    appointerId: string;
    children: TransferableChild[];
  } | null>(null);
  // 任命只能对空缺岗位，替换须先走罢免/剥夺流程

  if (!player || !target) return null;

  // 获取玩家有权管理的所有岗位
  const allPosts = useMemo(() => getAppointablePosts(player), [player]);

  // ── 地方岗位按 guo → dao → zhou 组织 ──
  const localTree = useMemo(() => {
    const localPosts = allPosts.filter(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.scope === 'local' && p.territoryId;
    });

    // 按领地分组
    const byTerritory = new Map<string, Post[]>();
    for (const p of localPosts) {
      const tid = p.territoryId!;
      if (!byTerritory.has(tid)) byTerritory.set(tid, []);
      byTerritory.get(tid)!.push(p);
    }

    // 构建 guo → dao → zhou 树
    const guos: { territory: Territory; daos: { territory: Territory; posts: Post[]; zhous: { territory: Territory; posts: Post[] }[] }[]; posts: Post[] }[] = [];

    for (const guo of [...territories.values()].filter(t => t.tier === 'guo')) {
      const guoPosts = byTerritory.get(guo.id) ?? [];
      const daos: typeof guos[0]['daos'] = [];

      for (const daoId of guo.childIds) {
        const dao = territories.get(daoId);
        if (!dao) continue;
        const daoPosts = byTerritory.get(daoId) ?? [];
        const zhous: { territory: Territory; posts: Post[] }[] = [];

        for (const zhouId of dao.childIds) {
          const zhou = territories.get(zhouId);
          if (!zhou) continue;
          const zhouPosts = byTerritory.get(zhouId) ?? [];
          if (zhouPosts.length > 0) zhous.push({ territory: zhou, posts: zhouPosts });
        }

        if (daoPosts.length > 0 || zhous.length > 0) {
          daos.push({ territory: dao, posts: daoPosts, zhous });
        }
      }

      if (guoPosts.length > 0 || daos.length > 0) {
        guos.push({ territory: guo, daos, posts: guoPosts });
      }
    }

    return guos;
  }, [allPosts, territories]);

  // ── 中央岗位按机构分组 ──
  const centralByInst = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of allPosts) {
      const tpl = positionMap.get(p.templateId);
      if (tpl?.scope !== 'central') continue;
      if (p.templateId === 'pos-emperor') continue;
      const inst = tpl.institution ?? '其他';
      if (!map.has(inst)) map.set(inst, []);
      map.get(inst)!.push(p);
    }
    return map;
  }, [allPosts]);

  // ── 渲染单个岗位行 ──
  function renderPostRow(post: Post, displayName?: string) {
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return null;

    const label = displayName ?? tpl.name;
    const effectiveRank = getEffectiveMinRank(post);
    const rankDef = rankMap.get(effectiveRank);
    const rankLabel = rankDef?.name ?? `${effectiveRank}品`;
    const holderChar = post.holderId ? characters.get(post.holderId) : undefined;
    const isOccupied = !!holderChar;

    const check = canAppointToPost(player!, target!, post);
    // 已占岗位禁止直接替换——须先走罢免/剥夺领地流程（自己持有的岗位可以直接授予）
    const isHeldByPlayer = post.holderId === player!.id;
    const occupiedReason = isOccupied && !isHeldByPlayer ? '需先罢免现任' : undefined;
    const disabled = !check.ok || (isOccupied && !isHeldByPlayer);

    return (
      <button
        key={post.id}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          executeAppoint(post.id, targetId, player!.id);
          // 检查法理下级可选转移
          const postTpl = positionMap.get(post.templateId);
          if (postTpl?.grantsControl && post.territoryId) {
            const children = getTransferableChildren(post.territoryId, targetId, player!.id);
            if (children.length > 0) {
              setTransferState({ newHolderId: targetId, appointerId: player!.id, children });
              return;
            }
          }
          onClose();
        }}
        className={`w-full flex items-center justify-between px-3 py-2 rounded border text-left transition-colors ${
          disabled
            ? 'border-[var(--color-border)] opacity-40 cursor-not-allowed'
            : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] cursor-pointer'
        }`}
      >
        <div className="flex flex-col gap-0.5 min-w-0 mr-2">
          <span className="text-sm text-[var(--color-text)]">{label}</span>
          {isOccupied ? (
            <span className="text-xs text-[var(--color-accent-gold)]">{holderChar.name}</span>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)] italic">空缺</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-xs text-[var(--color-text-muted)]">{rankLabel}</span>
          {(occupiedReason || check.reason) && (
            <span className="text-xs text-[var(--color-accent-red)]">{occupiedReason ?? check.reason}</span>
          )}
        </div>
      </button>
    );
  }

  // ── 折叠切换 ──
  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  function renderGroupHeader(label: string, expanded: boolean, onClick: () => void, count?: number) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span>{label}</span>
        {count !== undefined && <span className="text-[10px] opacity-60">({count})</span>}
      </button>
    );
  }

  // ── 法理下级转移弹窗 ──
  if (transferState) {
    return (
      <TransferChildrenFlow
        newHolderId={transferState.newHolderId}
        appointerId={transferState.appointerId}
        children={transferState.children}
        onClose={() => {
          setTransferState(null);
          onClose();
        }}
      />
    );
  }

  // ── 主界面 ──
  return (
    <Modal size="lg" onOverlayClick={onClose}>
      <ModalHeader title={`任命 ${target.name}`} onClose={onClose} />

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] shrink-0">
          {([
            { key: 'local' as const, label: '地方' },
            { key: 'central' as const, label: '中央' },
          ]).map(({ key, label }) => (
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-2">

          {/* 地方 Tab */}
          {activeTab === 'local' && (
            <div className="space-y-1">
              {localTree.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-4">无可管理的地方岗位</p>
              )}
              {localTree.map(guo => {
                const guoExpanded = expandedGuos.has(guo.territory.id);
                const totalPosts = guo.posts.length + guo.daos.reduce((s, d) => s + d.posts.length + d.zhous.reduce((s2, z) => s2 + z.posts.length, 0), 0);
                return (
                  <div key={guo.territory.id}>
                    {renderGroupHeader(
                      guo.territory.name,
                      guoExpanded,
                      () => toggle(expandedGuos, guo.territory.id, setExpandedGuos),
                      totalPosts,
                    )}
                    {guoExpanded && (
                      <div className="ml-3 space-y-1">
                        {guo.posts.map(p => renderPostRow(p))}
                        {guo.daos.map(dao => {
                          const daoExpanded = expandedDaos.has(dao.territory.id);
                          const daoPosts = dao.posts.length + dao.zhous.reduce((s, z) => s + z.posts.length, 0);
                          return (
                            <div key={dao.territory.id}>
                              {renderGroupHeader(
                                dao.territory.name,
                                daoExpanded,
                                () => toggle(expandedDaos, dao.territory.id, setExpandedDaos),
                                daoPosts,
                              )}
                              {daoExpanded && (
                                <div className="ml-3 space-y-1">
                                  {dao.posts.map(p => renderPostRow(p))}
                                  {dao.zhous.map(zhou => (
                                    <div key={zhou.territory.id} className="ml-3 space-y-1">
                                      <div className="text-[10px] text-[var(--color-text-muted)] px-2 pt-1">{zhou.territory.name}</div>
                                      {zhou.posts.map(p => renderPostRow(p))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 中央 Tab */}
          {activeTab === 'central' && (
            <div className="space-y-1">
              {centralByInst.size === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-4">无可管理的中央岗位</p>
              )}
              {INSTITUTION_ORDER.map(inst => {
                const posts = centralByInst.get(inst);
                const children = childInstitutions(inst);
                const hasChildren = children.length > 0;
                if ((!posts || posts.length === 0) && !hasChildren) return null;

                const isExpanded = expandedInsts.has(inst);
                const totalCount = (posts?.length ?? 0) + children.reduce((s, c) => s + (centralByInst.get(c.id)?.length ?? 0), 0);

                return (
                  <div key={inst} className="border border-[var(--color-border)] rounded">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg)] transition-colors"
                      onClick={() => {
                        const next = new Set(expandedInsts);
                        if (next.has(inst)) next.delete(inst); else next.add(inst);
                        setExpandedInsts(next);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--color-text-muted)]">{isExpanded ? '▼' : '▶'}</span>
                        <span className="text-sm font-bold text-[var(--color-accent-gold)]">{inst}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] opacity-60">({totalCount})</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-[var(--color-border)] px-2 py-1.5 space-y-1.5">
                        {/* 直属岗位 */}
                        {posts && posts.length > 0 && (
                          <div className="space-y-1">
                            {posts.map(p => renderPostRow(p))}
                          </div>
                        )}
                        {/* 子机构二级折叠 */}
                        {children.map(child => {
                          const childPosts = centralByInst.get(child.id);
                          if (!childPosts || childPosts.length === 0) return null;
                          const childExpanded = expandedInsts.has(child.id);
                          return (
                            <div key={child.id} className="border border-[var(--color-border)] rounded ml-1">
                              <button
                                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg)] transition-colors"
                                onClick={() => {
                                  const next = new Set(expandedInsts);
                                  if (next.has(child.id)) next.delete(child.id); else next.add(child.id);
                                  setExpandedInsts(next);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-[var(--color-text-muted)]">{childExpanded ? '▼' : '▶'}</span>
                                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{child.name}</span>
                                  <span className="text-[10px] text-[var(--color-text-muted)] opacity-60">({childPosts.length})</span>
                                </div>
                              </button>
                              {childExpanded && (
                                <div className="border-t border-[var(--color-border)] px-2 py-1.5 space-y-1">
                                  {childPosts.map(p => renderPostRow(p))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </Modal>
  );
}
