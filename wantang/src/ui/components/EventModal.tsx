import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { traitMap } from '@data/traits';
import { useNotificationStore, type StoryEventOption } from '@ui/stores/notificationStore';
import { usePanelStore } from '@ui/stores/panelStore';

// ── 角色卡片 ──────────────────────────────────────────────

function ActorCard({ characterId, role }: { characterId: string; role: string }) {
  const character = useCharacterStore((s) => s.characters.get(characterId));
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const expectedLeg = useTerritoryStore((s) => s.expectedLegitimacy.get(characterId) ?? null);

  if (!character) return null;

  const opinion = player && player.id !== characterId
    ? calculateBaseOpinion(player, character, expectedLeg)
    : null;

  const traits = character.traitIds
    .map((id) => traitMap.get(id))
    .filter(Boolean)
    .slice(0, 4); // 最多显示 4 个特质

  const handleClick = () => {
    usePanelStore.getState().pushCharacter(characterId);
  };

  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={handleClick}
      title="点击查看人物详情"
    >
      {/* 头像 */}
      <div className="w-16 h-16 rounded-lg bg-[var(--color-accent-gold)] flex items-center justify-center text-xl font-bold text-[var(--color-bg)] shadow-md">
        {character.name.charAt(0)}
      </div>
      {/* 名字 + 角色定位 */}
      <div className="text-center">
        <div className="text-sm font-bold text-[var(--color-text)]">{character.name}</div>
        <div className="text-[10px] text-[var(--color-text-muted)]">{role}</div>
      </div>
      {/* 好感度 */}
      {opinion !== null && (
        <div className="text-xs">
          <span className="text-[var(--color-text-muted)]">好感 </span>
          <span style={{
            color: opinion > 0 ? 'var(--color-accent-green)' : opinion < 0 ? 'var(--color-accent-red)' : 'var(--color-text)',
          }}>
            {opinion > 0 ? '+' : ''}{opinion}
          </span>
        </div>
      )}
      {/* 特质 */}
      {traits.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {traits.map((trait) => (
            <span
              key={trait!.id}
              className="px-1 py-0.5 rounded text-[9px] border"
              style={{
                borderColor: trait!.category === 'innate' ? '#8e44ad'
                  : trait!.category === 'personality' ? '#2980b9'
                  : trait!.category === 'education' ? '#27ae60'
                  : '#c0392b',
                color: 'var(--color-text)',
              }}
              title={trait!.description}
            >
              {trait!.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 决策选项按钮 ──────────────────────────────────────────

function OptionButton({ option, onSelect }: { option: StoryEventOption; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative">
      <button
        className="w-full text-left px-4 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/80 hover:border-[var(--color-accent-gold)]/60 hover:bg-[var(--color-bg-surface)]/60 transition-colors text-sm text-[var(--color-text)]"
        onClick={onSelect}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {option.label}
      </button>

      {/* Hover 预览：效果列表 */}
      {hovered && (option.effects.length > 0 || option.successChance !== undefined) && (
        <div
          className="absolute right-full top-0 mr-2 w-48 rounded-lg border border-[var(--color-border)] p-3 flex flex-col gap-1.5 text-xs z-50"
          style={{
            background: 'var(--color-bg-panel)',
            boxShadow: 'var(--shadow-panel)',
          }}
        >
          {option.successChance !== undefined && (
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">成功率</span>
              <span style={{
                color: option.successChance >= 70 ? 'var(--color-accent-green)'
                  : option.successChance >= 40 ? '#eab308'
                  : 'var(--color-accent-red)',
              }}>
                {option.successChance}%
              </span>
            </div>
          )}
          {option.description && (
            <div className="text-[var(--color-text-muted)] text-[11px] pb-1 border-b border-[var(--color-border)]">
              {option.description}
            </div>
          )}
          {option.effects.map((effect, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">{effect.label}</span>
              <span style={{
                color: effect.type === 'positive' ? 'var(--color-accent-green)'
                  : effect.type === 'negative' ? 'var(--color-accent-red)'
                  : 'var(--color-text)',
              }}>
                {effect.value > 0 ? '+' : ''}{effect.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

const EventModal: React.FC = () => {
  const queue = useNotificationStore((s) => s.storyEventQueue);
  const popStoryEvent = useNotificationStore((s) => s.popStoryEvent);

  const event = queue[0];
  if (!event) return null;

  const handleSelect = (option: StoryEventOption) => {
    option.onSelect();
    popStoryEvent();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="flex rounded-xl border border-[var(--color-border)] overflow-hidden"
        style={{
          width: 'min(700px, 90vw)',
          maxHeight: '70vh',
          background: 'var(--color-bg-panel)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* 左侧：角色区 */}
        {event.actors.length > 0 && (
          <div
            className="flex flex-col items-center justify-center gap-4 p-5 shrink-0"
            style={{
              width: '35%',
              borderRight: '1px solid var(--color-border)',
              background: 'linear-gradient(180deg, rgba(15,52,96,0.4) 0%, rgba(22,33,62,0.6) 100%)',
            }}
          >
            {event.actors.map((actor) => (
              <ActorCard
                key={actor.characterId}
                characterId={actor.characterId}
                role={actor.role}
              />
            ))}
          </div>
        )}

        {/* 右侧：叙事+决策区 */}
        <div className="flex-1 flex flex-col p-5 min-w-0">
          {/* 事件标题 */}
          <h2 className="text-lg font-bold text-[var(--color-accent-gold)] mb-3">
            {event.title}
          </h2>

          {/* 事件正文 */}
          <div className="flex-1 text-sm text-[var(--color-text)] leading-relaxed mb-4 overflow-y-auto">
            {event.description}
          </div>

          {/* 决策选项 */}
          <div className="flex flex-col gap-2">
            {event.options.map((option, i) => (
              <OptionButton
                key={i}
                option={option}
                onSelect={() => handleSelect(option)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventModal;
