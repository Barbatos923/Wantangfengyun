import { useCharacterStore } from '@engine/character/CharacterStore';
import { refreshPlayerLedger } from '@engine/interaction';
import type { CentralizationLevel } from '@engine/territory/types';

const CENTRALIZATION_OPTIONS: { level: CentralizationLevel; name: string; desc: string }[] = [
  { level: 1, name: '放任', desc: '上缴最低，下属可自由行动' },
  { level: 2, name: '一般', desc: '适度上缴，可剥夺下属头衔' },
  { level: 3, name: '严控', desc: '高额上缴，限制下属战争' },
  { level: 4, name: '压榨', desc: '最高上缴，完全控制下属' },
];

interface CentralizationFlowProps {
  targetId: string;
  onClose: () => void;
}

const CentralizationFlow: React.FC<CentralizationFlowProps> = ({ targetId, onClose }) => {
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const charStore = useCharacterStore;

  if (!target) {
    onClose();
    return null;
  }

  const currentLevel = target.centralization ?? 2;

  // 集权等级 → 好感修正：1级=+10, 2级=0, 3级=-10, 4级=-20
  const CENTRALIZATION_OPINION: Record<number, number> = { 1: 10, 2: 0, 3: -10, 4: -20 };

  const handleSelect = (level: CentralizationLevel) => {
    const store = charStore.getState();
    const playerId = store.playerId;
    store.updateCharacter(targetId, { centralization: level });

    // 状态型好感：按 reason 替换（不衰减）
    if (playerId) {
      const opinion = CENTRALIZATION_OPINION[level] ?? 0;
      store.setOpinion(targetId, playerId, {
        reason: '集权等级',
        value: opinion,
        decayable: false,
      });
    }

    refreshPlayerLedger();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--color-accent-gold)]">
            调整对 {target.name} 的集权
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">×</button>
        </div>

        <div className="space-y-1.5">
          {CENTRALIZATION_OPTIONS.map(({ level, name, desc }) => {
            const isActive = level === currentLevel;
            return (
              <button
                key={level}
                className={`w-full flex items-start gap-3 px-3 py-2 rounded border transition-colors text-left ${
                  isActive
                    ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]/40'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)]'
                }`}
                onClick={() => handleSelect(level)}
              >
                <span className={`text-sm font-bold shrink-0 ${isActive ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text-muted)]'}`}>
                  {level}级
                </span>
                <div className="min-w-0">
                  <span className={`text-sm font-bold ${isActive ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text)]'}`}>{name}</span>
                  <p className={`text-xs ${isActive ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>{desc}</p>
                </div>
                {isActive && (
                  <span className="text-xs text-[var(--color-accent-gold)] shrink-0 self-center">当前</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CentralizationFlow;
