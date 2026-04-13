import React from 'react';
import type { Territory } from '@engine/territory/types';
import type { Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import { positionMap } from '@data/positions';
import { PostRow } from './PostRow';

interface LocalOfficialsTabProps {
  daos: Territory[];
  territories: Map<string, Territory>;
  characters: Map<string, Character>;
  expandedDaos: Set<string>;
  expandedZhous: Set<string>;
  onToggleDao: (id: string) => void;
  onToggleZhou: (id: string) => void;
  onSelectCharacter: (id: string) => void;
}

function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const ga = positionMap.get(a.templateId)?.grantsControl ? 0 : 1;
    const gb = positionMap.get(b.templateId)?.grantsControl ? 0 : 1;
    return ga - gb;
  });
}

export const LocalOfficialsTab: React.FC<LocalOfficialsTabProps> = ({
  daos,
  territories,
  characters,
  expandedDaos,
  expandedZhous,
  onToggleDao,
  onToggleZhou,
  onSelectCharacter,
}) => {
  if (daos.length === 0) {
    return <p className="text-center text-[var(--color-text-muted)] py-4 text-sm">暂无道级领地</p>;
  }

  return (
    <div className="space-y-2">
      {daos.map((dao) => {
        const isExpanded = expandedDaos.has(dao.id);
        const childZhous = dao.childIds
          .map((id) => territories.get(id))
          .filter((t): t is NonNullable<typeof t> => !!t && t.tier === 'zhou');

        return (
          <div key={dao.id} className="rounded" style={{ border: '1px solid var(--color-border)' }}>
            {/* Dao header */}
            <button
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg)] transition-colors"
              onClick={() => onToggleDao(dao.id)}
            >
              <span className="text-sm font-bold text-[var(--color-accent-gold)]">{dao.name}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className="px-3 py-2 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                {/* Dao-level posts */}
                {dao.posts.length > 0 && (
                  <div className="space-y-1">
                    {sortPosts(dao.posts).map((post) => (
                      <PostRow key={post.id} post={post} prefix={dao.name} characters={characters} onSelectCharacter={onSelectCharacter} />
                    ))}
                  </div>
                )}

                {/* Child zhou territories */}
                {childZhous.map((zhou) => {
                  const zhouExpanded = expandedZhous.has(zhou.id);
                  return (
                    <div key={zhou.id} className="rounded" style={{ border: '1px solid var(--color-border)' }}>
                      <button
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg)] transition-colors"
                        onClick={() => onToggleZhou(zhou.id)}
                      >
                        <span className="text-xs font-bold text-[var(--color-text-muted)]">{zhou.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{zhouExpanded ? '▲' : '▼'}</span>
                      </button>
                      {zhouExpanded && (
                        <div className="px-2 py-1.5 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                          {sortPosts(zhou.posts).map((post) => (
                            <PostRow key={post.id} post={post} prefix={zhou.name} characters={characters} onSelectCharacter={onSelectCharacter} />
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
