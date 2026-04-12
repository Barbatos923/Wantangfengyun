import type { Territory } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { buildingMap } from '@data/buildings';
import { formatAmount } from '@ui/utils/formatAmount';
import { PanelSection, InfoRow, ProgressBar } from './base';
import { Tooltip } from './base/Tooltip';

interface TerritoryInfoSectionsProps {
  territory: Territory;
  isPlayerTerritory: boolean;
  onOpenBuildMenu: (slotIndex: number) => void;
  onOpenTransfer: (resource: 'money' | 'grain') => void;
}

const ATTRIBUTES = [
  { key: 'control' as const, label: '控制度', color: 'var(--color-accent-blue)' },
  { key: 'development' as const, label: '发展度', color: 'var(--color-accent-green)' },
  { key: 'populace' as const, label: '民心', color: '#d4a03c' },
];

export function TerritoryInfoSections({ territory, isPlayerTerritory, onOpenBuildMenu, onOpenTransfer }: TerritoryInfoSectionsProps) {
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);
  const sieges = useWarStore((s) => s.sieges);
  const campaigns = useWarStore((s) => s.campaigns);
  const characters = useCharacterStore((s) => s.characters);

  // Garrison
  const localArmies = Array.from(armies.values()).filter((a) => a.locationId === territory.id);
  const totalTroops = localArmies.reduce((s, a) => s + getArmyStrength(a, battalions), 0);

  // Siege
  const siege = Array.from(sieges.values()).find((s) => s.territoryId === territory.id);
  const siegeCampaign = siege ? campaigns.get(siege.campaignId) : undefined;
  const siegeAttacker = siegeCampaign ? characters.get(siegeCampaign.ownerId) : undefined;

  // Occupier
  const occupier = territory.occupiedBy ? characters.get(territory.occupiedBy) : undefined;

  const builtCount = territory.buildings.filter((b) => b.buildingId).length;
  const hasAnyConstruction = territory.constructions.length > 0;

  return (
    <div className="overflow-y-auto flex-1 pr-1" style={{ maxHeight: '400px' }}>
      {/* Treasury */}
      {territory.treasury && (
        <PanelSection title="国库">
          <InfoRow label="金钱">
            <span className="flex items-center gap-2">
              <span className="text-[var(--color-accent-gold)] font-bold">{formatAmount(territory.treasury.money)}</span>
              {isPlayerTerritory && (
                <button
                  onClick={() => onOpenTransfer('money')}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-accent-green)] text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/10 transition-colors"
                >
                  调拨
                </button>
              )}
            </span>
          </InfoRow>
          <InfoRow label="粮草">
            <span className="flex items-center gap-2">
              <span className="text-[var(--color-accent-gold)] font-bold">{formatAmount(territory.treasury.grain)}</span>
              {isPlayerTerritory && (
                <button
                  onClick={() => onOpenTransfer('grain')}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-accent-green)] text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/10 transition-colors"
                >
                  调拨
                </button>
              )}
            </span>
          </InfoRow>
        </PanelSection>
      )}

      {/* Attributes */}
      <PanelSection title="州政">
        {ATTRIBUTES.map(({ key, label, color }) => {
          const value = territory[key];
          return (
            <div key={key} className="mb-1.5 last:mb-0">
              <InfoRow label={label}>
                <span className="font-bold">{Math.floor(value)}</span>
                <span className="text-[var(--color-text-muted)]">/100</span>
              </InfoRow>
              <ProgressBar value={value} color={color} className="mt-0.5" />
            </div>
          );
        })}
      </PanelSection>

      {/* Buildings */}
      <PanelSection title="建筑" extra={`${builtCount}/${territory.buildings.length}`}>
        <div className="grid grid-cols-2 gap-2">
          {territory.buildings.map((slot, i) => (
            <BuildingSlotCard
              key={i}
              slot={slot}
              index={i}
              territory={territory}
              isPlayerTerritory={isPlayerTerritory}
              hasAnyConstruction={hasAnyConstruction}
              onOpenBuildMenu={onOpenBuildMenu}
            />
          ))}
        </div>
      </PanelSection>

      {/* Garrison */}
      <PanelSection title="驻军" extra={totalTroops > 0 ? `${totalTroops.toLocaleString()}人` : undefined}>
        {territory.passName && (
          <InfoRow label="关隘">
            <span className="text-[var(--color-accent-gold)]">{territory.passName}</span>
            <span className="text-[var(--color-text-muted)] ml-1">Lv.{territory.passLevel}</span>
          </InfoRow>
        )}
        {localArmies.length > 0 ? (
          <div className="space-y-0.5">
            {localArmies.map((a) => {
              const strength = getArmyStrength(a, battalions);
              const commander = a.commanderId ? characters.get(a.commanderId) : undefined;
              return (
                <div key={a.id} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-[var(--color-text)]">{a.name}</span>
                  <span className="text-[var(--color-text-muted)]">
                    {strength.toLocaleString()}人{commander ? ` · ${commander.name}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-[var(--color-text-muted)] py-0.5">无驻军</div>
        )}
      </PanelSection>

      {/* Occupation */}
      {territory.occupiedBy && (
        <PanelSection title="被占领">
          <div
            className="px-2.5 py-2 rounded text-xs"
            style={{
              background: 'rgba(168,69,53,0.1)',
              border: '1px solid var(--color-accent-red)',
            }}
          >
            <InfoRow label="占领者">
              <span className="text-[var(--color-accent-red)] font-bold">{occupier?.name ?? '未知'}</span>
            </InfoRow>
          </div>
        </PanelSection>
      )}

      {/* Siege */}
      {siege && (
        <PanelSection title="围城">
          <div
            className="px-2.5 py-2 rounded"
            style={{
              background: 'rgba(168,69,53,0.1)',
              border: '1px solid var(--color-accent-red)',
            }}
          >
            <InfoRow label="攻方">
              <span className="text-[var(--color-accent-red)] font-bold">{siegeAttacker?.name ?? '未知'}</span>
            </InfoRow>
            <InfoRow label="进度">
              <span className="text-[var(--color-accent-red)] font-bold">{Math.floor(siege.progress)}%</span>
            </InfoRow>
            <ProgressBar value={siege.progress} color="var(--color-accent-red)" className="mt-1" />
          </div>
        </PanelSection>
      )}
    </div>
  );
}

/* ─── Building Slot Card ─── */

interface BuildingSlotCardProps {
  slot: Territory['buildings'][number];
  index: number;
  territory: Territory;
  isPlayerTerritory: boolean;
  hasAnyConstruction: boolean;
  onOpenBuildMenu: (slotIndex: number) => void;
}

const CARD_BASE: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(26,22,16,0.8) 0%, rgba(14,12,10,0.8) 100%)',
  border: '1px solid rgba(74,62,49,0.4)',
};

function BuildingSlotCard({ slot, index, territory, isPlayerTerritory, hasAnyConstruction, onOpenBuildMenu }: BuildingSlotCardProps) {
  const underConstruction = territory.constructions.find((c) => c.slotIndex === index);

  // Under construction
  if (underConstruction) {
    const consDef = buildingMap.get(underConstruction.buildingId);
    return (
      <div
        className="rounded px-2.5 py-2 text-xs"
        style={{ ...CARD_BASE, borderColor: 'var(--color-accent-blue)' }}
      >
        <div className="text-[var(--color-text)] font-bold">{consDef?.name ?? underConstruction.buildingId}</div>
        <div className="text-[var(--color-text-muted)] mt-0.5">施工中 · 剩余{underConstruction.remainingMonths}月</div>
      </div>
    );
  }

  // Empty slot
  if (!slot.buildingId) {
    if (isPlayerTerritory) {
      const disabled = hasAnyConstruction;
      const btn = (
        <button
          onClick={() => { if (!disabled) onOpenBuildMenu(index); }}
          disabled={disabled}
          className={`rounded px-2.5 py-2 text-xs text-center transition-all w-full ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
          style={{
            ...CARD_BASE,
            borderStyle: 'dashed',
            borderColor: disabled ? 'rgba(74,62,49,0.4)' : 'rgba(184,154,83,0.5)',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent-gold)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 4px rgba(184,154,83,0.15)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = disabled ? 'rgba(74,62,49,0.4)' : 'rgba(184,154,83,0.5)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
          }}
        >
          <span className="text-[var(--color-text-muted)]">＋ 建造</span>
        </button>
      );
      return disabled ? <Tooltip content="本州已有工程在施工">{btn}</Tooltip> : btn;
    }
    return (
      <div className="rounded px-2.5 py-2 text-xs text-center text-[var(--color-text-muted)]" style={CARD_BASE}>
        空槽
      </div>
    );
  }

  // Built building
  const def = buildingMap.get(slot.buildingId);
  const isMaxLevel = slot.level >= (def?.maxLevel ?? 3);

  if (isMaxLevel) {
    return (
      <div className="rounded px-2.5 py-2 text-xs" style={CARD_BASE}>
        <span className="text-[var(--color-text)] font-bold">{def?.name ?? slot.buildingId}</span>
        <span className="text-[var(--color-text-muted)] ml-1">Lv.{slot.level}</span>
        <span className="text-[var(--color-accent-green)] ml-1">满级</span>
      </div>
    );
  }

  // Upgradeable
  if (isPlayerTerritory) {
    const disabled = hasAnyConstruction;
    const btn = (
      <button
        onClick={() => { if (!disabled) onOpenBuildMenu(index); }}
        disabled={disabled}
        className={`rounded px-2.5 py-2 text-xs text-left w-full transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        style={CARD_BASE}
        onMouseEnter={(e) => {
          if (!disabled) {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent-gold)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 0 4px rgba(184,154,83,0.15)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,62,49,0.4)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }}
      >
        <span className="text-[var(--color-text)] font-bold">{def?.name ?? slot.buildingId}</span>
        <span className="text-[var(--color-text-muted)] ml-1">Lv.{slot.level}</span>
        <span className={`ml-1 ${disabled ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-accent-gold)]'}`}>
          {disabled ? '施工中' : '可升级'}
        </span>
      </button>
    );
    return disabled ? <Tooltip content="本州已有工程在施工">{btn}</Tooltip> : btn;
  }

  // Non-player built building (display only)
  return (
    <div className="rounded px-2.5 py-2 text-xs" style={CARD_BASE}>
      <span className="text-[var(--color-text)] font-bold">{def?.name ?? slot.buildingId}</span>
      <span className="text-[var(--color-text-muted)] ml-1">Lv.{slot.level}</span>
    </div>
  );
}
