import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getAppointableVacantPosts, executeAppoint } from '@engine/interaction';
import { canAppointToPost } from '@engine/official/officialUtils';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';

interface AppointFlowProps {
  targetId: string;
  onClose: () => void;
}

export default function AppointFlow({ targetId, onClose }: AppointFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const territories = useTerritoryStore((s) => s.territories);

  if (!player || !target) return null;

  const vacantPosts = getAppointableVacantPosts(player);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl max-h-[80vh] flex flex-col gap-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-accent-gold)]">任命 {target.name}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-2">
          {vacantPosts.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">暂无可任命岗位</p>
          )}
          {vacantPosts.map((post) => {
            const tpl = positionMap.get(post.templateId);
            if (!tpl) return null;

            const rankDef = rankMap.get(tpl.minRank);
            const rankLabel = rankDef?.name ?? `${tpl.minRank}`;
            const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
            const displayName = terrName ? `${terrName}${tpl.name}` : tpl.name;

            const check = canAppointToPost(player, target, post);
            const disabled = !check.ok;
            const reason = check.reason;

            return (
              <button
                key={post.id}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  executeAppoint(post.id, targetId, player.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded border text-left transition-colors ${
                  disabled
                    ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] cursor-pointer'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-[var(--color-text)]">{displayName}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{tpl.institution}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-xs text-[var(--color-text-muted)]">品 {rankLabel}</span>
                  {reason && (
                    <span className="text-xs text-[var(--color-accent-red)]">{reason}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
