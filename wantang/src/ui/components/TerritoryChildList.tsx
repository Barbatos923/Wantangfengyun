import type { Territory } from '@engine/territory/types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getActualController } from '@engine/official/officialUtils';
import { PanelSection } from './base';

interface TerritoryChildListProps {
  territory: Territory;
  onClickRuler?: (characterId: string) => void;
  onClickTerritory?: (territoryId: string) => void;
}

export function TerritoryChildList({ territory, onClickRuler, onClickTerritory }: TerritoryChildListProps) {
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);

  return (
    <PanelSection title="下辖州" extra={`${territory.childIds.length}`}>
      <div className="space-y-1.5">
        {territory.childIds.map((childId) => {
          const child = territories.get(childId);
          if (!child) return null;
          const childControllerId = getActualController(child);
          const childRuler = childControllerId ? characters.get(childControllerId) : undefined;
          return (
            <button
              key={childId}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded transition-colors text-left"
              style={{
                background: 'linear-gradient(145deg, rgba(26,22,16,0.6) 0%, rgba(14,12,10,0.6) 100%)',
                border: '1px solid rgba(74,62,49,0.4)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent-gold)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 4px rgba(184,154,83,0.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,62,49,0.4)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
              onClick={() => onClickTerritory?.(childId)}
            >
              <span className="text-sm text-[var(--color-accent-gold)] font-bold">{child.name}</span>
              {childRuler ? (
                <span
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent-gold)] hover:underline"
                  onClick={(e) => { e.stopPropagation(); onClickRuler?.(childRuler.id); }}
                >
                  {childRuler.name}
                </span>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">无主</span>
              )}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}
