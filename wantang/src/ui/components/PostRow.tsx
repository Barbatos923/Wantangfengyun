import React from 'react';
import type { Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';
import { Tooltip } from './base/Tooltip';

interface PostRowProps {
  post: Post;
  prefix?: string;
  characters: Map<string, Character>;
  onSelectCharacter: (id: string) => void;
}

export const PostRow: React.FC<PostRowProps> = ({ post, prefix, characters, onSelectCharacter }) => {
  const tpl = positionMap.get(post.templateId);
  if (!tpl) return null;

  const label = prefix ? `${prefix}${tpl.name}` : tpl.name;
  const holder = post.holderId ? characters.get(post.holderId) : undefined;
  const minRankName = rankMap.get(tpl.minRank)?.name ?? '';
  const holderRankName = holder?.official ? (rankMap.get(holder.official.rankLevel)?.name ?? '') : undefined;

  return (
    <button
      className={`w-full flex items-center justify-between px-3 py-2 rounded text-left transition-colors ${
        holder
          ? 'hover:bg-[var(--color-bg)] cursor-pointer'
          : 'cursor-default'
      }`}
      style={{ border: '1px solid var(--color-border)' }}
      onClick={() => {
        if (holder) onSelectCharacter(post.holderId!);
      }}
    >
      <div className="flex flex-col min-w-0 mr-2">
        <span className="text-sm text-[var(--color-text)]">{label}</span>
        {holder ? (
          <span className="text-xs text-[var(--color-accent-gold)]">{holder.name}</span>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)] italic">暂缺</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Tooltip content={holderRankName ? <><div>职位最低品级：{minRankName}</div><div>人物实际品级：{holderRankName}</div></> : `职位最低品级：${minRankName}`}>
          <span className="text-xs text-[var(--color-text-muted)]">{minRankName}</span>
        </Tooltip>
        {post.successionLaw === 'clan' && (
          <Tooltip content="世袭：宗法继承">
            <span className="text-[10px] px-1 py-0.5 rounded border text-amber-400 border-amber-400/40">
              世袭
            </span>
          </Tooltip>
        )}
        {post.hasAppointRight && (
          <Tooltip content="辟署：可自行任命属官">
            <span className="text-[10px] px-1 py-0.5 rounded border text-purple-400 border-purple-400/40">
              辟署
            </span>
          </Tooltip>
        )}
      </div>
    </button>
  );
};
