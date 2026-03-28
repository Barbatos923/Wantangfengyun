import React, { useState, useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';
import { childInstitutions } from '@data/institutions';
import { usePanelStore } from '@ui/stores/panelStore';
import type { Post } from '@engine/territory/types';
import type { Institution } from '@engine/official/types';

interface GovernmentPanelProps {
  onClose: () => void;
}

type TabKey = 'capital' | 'local';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'capital', label: '京官' },
  { key: 'local', label: '地方官' },
];

// 机构显示顺序（排除皇室；六部作为尚书省子级，不在此列出）
const INSTITUTION_ORDER: Institution[] = [
  '中书门下', '翰林院', '枢密院', '神策军',
  '三司', '中书省', '门下省', '尚书省',
  '御史台', '秘书省', '三公',
];


const GovernmentPanel: React.FC<GovernmentPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('capital');
  const [expandedDaos, setExpandedDaos] = useState<Set<string>>(new Set());
  const [expandedZhous, setExpandedZhous] = useState<Set<string>>(new Set());
  const [expandedInsts, setExpandedInsts] = useState<Set<string>>(new Set());
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);

  // ── Capital tab: 按机构分组中央岗位（排除皇帝）──
  const centralByInstitution = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of centralPosts) {
      if (post.templateId === 'pos-emperor') continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.institution) continue;
      const inst = tpl.institution;
      if (!map.has(inst)) map.set(inst, []);
      map.get(inst)!.push(post);
    }
    return map;
  }, [centralPosts]);

  // ── Local tab: dao territories ──
  const daos = useMemo(
    () => [...territories.values()].filter((t) => t.tier === 'dao').sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    [territories],
  );

  function sortPosts(posts: Post[]): Post[] {
    return [...posts].sort((a, b) => {
      const ga = positionMap.get(a.templateId)?.grantsControl ? 0 : 1;
      const gb = positionMap.get(b.templateId)?.grantsControl ? 0 : 1;
      return ga - gb;
    });
  }

  function toggleDao(id: string) {
    setExpandedDaos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleZhou(id: string) {
    setExpandedZhous((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleInst(id: string) {
    setExpandedInsts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderPostRow(post: Post, prefix?: string) {
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return null;
    const label = prefix ? `${prefix}${tpl.name}` : tpl.name;
    const holderChar = post.holderId ? characters.get(post.holderId) : undefined;

    return (
      <button
        key={post.id}
        className={`w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] text-left transition-colors ${
          holderChar
            ? 'hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] cursor-pointer'
            : 'cursor-default'
        }`}
        onClick={() => {
          if (holderChar) {
            usePanelStore.getState().pushCharacter(post.holderId!);
            onClose();
          }
        }}
      >
        <div className="flex flex-col min-w-0 mr-2">
          <span className="text-sm text-[var(--color-text)]">{label}</span>
          {holderChar ? (
            <span className="text-xs text-[var(--color-accent-gold)]">{holderChar.name}</span>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)] italic">暂缺</span>
          )}
        </div>
        <span className="text-xs text-[var(--color-text-muted)] shrink-0">
          {holderChar?.official
            ? (rankMap.get(holderChar.official.rankLevel)?.name ?? '')
            : `需 ${rankMap.get(tpl.minRank)?.name ?? ''}`}
        </span>
      </button>
    );
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
            <h2 className="text-lg font-bold text-[var(--color-accent-gold)]">政体</h2>
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

            {/* ── 京官 tab ── */}
            {activeTab === 'capital' && (
              <div className="space-y-2">
                {INSTITUTION_ORDER.map((inst) => {
                  const posts = centralByInstitution.get(inst);
                  const children = childInstitutions(inst);
                  const hasChildren = children.length > 0;
                  // 无直属岗位也无子机构时跳过
                  if ((!posts || posts.length === 0) && !hasChildren) return null;

                  const isExpanded = expandedInsts.has(inst);
                  return (
                    <div key={inst} className="border border-[var(--color-border)] rounded">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg)] transition-colors"
                        onClick={() => toggleInst(inst)}
                      >
                        <span className="text-sm font-bold text-[var(--color-accent-gold)]">{inst}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-[var(--color-border)] px-3 py-2 space-y-3">
                          {/* 直属岗位 */}
                          {posts && posts.length > 0 && (
                            <div className="space-y-1">
                              {posts.map((post) => renderPostRow(post))}
                            </div>
                          )}
                          {/* 子机构二级折叠 */}
                          {children.map((child) => {
                            const childPosts = centralByInstitution.get(child.id);
                            if (!childPosts || childPosts.length === 0) return null;
                            const childExpanded = expandedInsts.has(child.id);
                            return (
                              <div key={child.id} className="border border-[var(--color-border)] rounded">
                                <button
                                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg)] transition-colors"
                                  onClick={() => toggleInst(child.id)}
                                >
                                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{child.name}</span>
                                  <span className="text-xs text-[var(--color-text-muted)]">{childExpanded ? '▲' : '▼'}</span>
                                </button>
                                {childExpanded && (
                                  <div className="border-t border-[var(--color-border)] px-2 py-1.5 space-y-1">
                                    {childPosts.map((post) => renderPostRow(post))}
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

            {/* ── 地方官 tab ── */}
            {activeTab === 'local' && (
              <div className="space-y-2">
                {daos.length === 0 && (
                  <p className="text-center text-[var(--color-text-muted)] py-4 text-sm">暂无道级领地</p>
                )}
                {daos.map((dao) => {
                  const isExpanded = expandedDaos.has(dao.id);
                  const childZhous = dao.childIds
                    .map((id) => territories.get(id))
                    .filter((t): t is NonNullable<typeof t> => !!t && t.tier === 'zhou');

                  return (
                    <div key={dao.id} className="border border-[var(--color-border)] rounded">
                      {/* Dao header */}
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg)] transition-colors"
                        onClick={() => toggleDao(dao.id)}
                      >
                        <span className="text-sm font-bold text-[var(--color-accent-gold)]">{dao.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-[var(--color-border)] px-3 py-2 space-y-3">
                          {/* Dao-level posts */}
                          {dao.posts.length > 0 && (
                            <div className="space-y-1">
                              {sortPosts(dao.posts).map((post) => renderPostRow(post, dao.name))}
                            </div>
                          )}

                          {/* Child zhou territories — each collapsible */}
                          {childZhous.map((zhou) => {
                            const zhouExpanded = expandedZhous.has(zhou.id);
                            return (
                              <div key={zhou.id} className="border border-[var(--color-border)] rounded">
                                <button
                                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg)] transition-colors"
                                  onClick={() => toggleZhou(zhou.id)}
                                >
                                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{zhou.name}</span>
                                  <span className="text-xs text-[var(--color-text-muted)]">{zhouExpanded ? '▲' : '▼'}</span>
                                </button>
                                {zhouExpanded && (
                                  <div className="border-t border-[var(--color-border)] px-2 py-1.5 space-y-1">
                                    {sortPosts(zhou.posts).map((post) => renderPostRow(post, zhou.name))}
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
        </div>
    </div>
  );
};

export default GovernmentPanel;
