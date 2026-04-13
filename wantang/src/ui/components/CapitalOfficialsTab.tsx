import React from 'react';
import type { Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { Institution } from '@engine/official/types';
import { childInstitutions } from '@data/institutions';
import { PostRow } from './PostRow';

// 机构显示顺序（排除皇室；六部作为尚书省子级，不在此列出）
const INSTITUTION_ORDER: Institution[] = [
  '中书门下', '翰林院', '枢密院', '神策军',
  '三司', '中书省', '门下省', '尚书省',
  '吏部', '户部', '礼部', '兵部', '刑部', '工部',
  '御史台', '秘书省', '三公',
];

interface CapitalOfficialsTabProps {
  centralByInstitution: Map<string, Post[]>;
  characters: Map<string, Character>;
  expandedInsts: Set<string>;
  onToggleInst: (id: string) => void;
  onSelectCharacter: (id: string) => void;
}

export const CapitalOfficialsTab: React.FC<CapitalOfficialsTabProps> = ({
  centralByInstitution,
  characters,
  expandedInsts,
  onToggleInst,
  onSelectCharacter,
}) => {
  return (
    <div className="space-y-2">
      {INSTITUTION_ORDER.map((inst) => {
        const posts = centralByInstitution.get(inst);
        const children = childInstitutions(inst);
        const hasChildren = children.length > 0;
        if ((!posts || posts.length === 0) && !hasChildren) return null;

        const isExpanded = expandedInsts.has(inst);
        return (
          <div key={inst} className="rounded" style={{ border: '1px solid var(--color-border)' }}>
            <button
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg)] transition-colors"
              onClick={() => onToggleInst(inst)}
            >
              <span className="text-sm font-bold text-[var(--color-accent-gold)]">{inst}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className="px-3 py-2 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                {/* 直属岗位 */}
                {posts && posts.length > 0 && (
                  <div className="space-y-1">
                    {posts.map((post) => (
                      <PostRow key={post.id} post={post} characters={characters} onSelectCharacter={onSelectCharacter} />
                    ))}
                  </div>
                )}

                {/* 子机构二级折叠 */}
                {children.map((child) => {
                  const childPosts = centralByInstitution.get(child.id);
                  if (!childPosts || childPosts.length === 0) return null;
                  const childExpanded = expandedInsts.has(child.id);
                  return (
                    <div key={child.id} className="rounded" style={{ border: '1px solid var(--color-border)' }}>
                      <button
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg)] transition-colors"
                        onClick={() => onToggleInst(child.id)}
                      >
                        <span className="text-xs font-bold text-[var(--color-text-muted)]">{child.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{childExpanded ? '▲' : '▼'}</span>
                      </button>
                      {childExpanded && (
                        <div className="px-2 py-1.5 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                          {childPosts.map((post) => (
                            <PostRow key={post.id} post={post} characters={characters} onSelectCharacter={onSelectCharacter} />
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
  );
};
