import type { Territory } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import { AvatarBadge } from './base';

interface TerritoryHeaderProps {
  territory: Territory;
  ruler: Character | undefined;
  onClose: () => void;
  onClickRuler?: (characterId: string) => void;
}

const TIER_LABEL: Record<string, string> = { zhou: '州', dao: '道', guo: '国' };

export function TerritoryHeader({ territory, ruler, onClose, onClickRuler }: TerritoryHeaderProps) {
  const tierLabel = TIER_LABEL[territory.tier] ?? territory.tier;
  const typeLabel = territory.territoryType === 'civil' ? '民政' : '军事';

  return (
    <div className="shrink-0">
      {/* Header: territory info left, controller + close right */}
      <div className="flex items-start justify-between mb-3">
        {/* Left: name + metadata */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <h2 className="text-xl font-bold text-[var(--color-text)] truncate">{territory.name}</h2>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{
                border: '1px solid var(--color-accent-gold)',
                color: 'var(--color-accent-gold)',
              }}
            >
              {tierLabel}
            </span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {typeLabel}
            {territory.tier === 'zhou' && (
              <> · 户数 {territory.basePopulation.toLocaleString()}</>
            )}
          </div>
        </div>

        {/* Right: controller avatar + close button */}
        <div className="flex items-start gap-3 shrink-0 ml-3">
          <AvatarBadge
            name={ruler?.name}
            label="控制者"
            size="md"
            empty={!ruler}
            onClick={ruler ? () => onClickRuler?.(ruler.id) : undefined}
          />
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none px-1 mt-1"
          >
            ×
          </button>
        </div>
      </div>

      {/* Gold divider */}
      <div className="-mx-5 mb-3" style={{ height: '1px', background: 'rgba(74,62,49,0.3)' }} />
    </div>
  );
}
