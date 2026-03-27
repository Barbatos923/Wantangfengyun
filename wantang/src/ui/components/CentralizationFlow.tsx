import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { refreshPlayerLedger } from '@engine/interaction';
import { positionMap } from '@data/positions';
import type { CentralizationLevel } from '@engine/territory/types';
import type { Post } from '@engine/territory/types';

const CENTRALIZATION_OPTIONS: { level: CentralizationLevel; name: string; desc: string }[] = [
  { level: 1, name: '放任', desc: '上缴最低，下属可自由行动' },
  { level: 2, name: '一般', desc: '适度上缴，可剥夺下属头衔' },
  { level: 3, name: '严控', desc: '高额上缴，限制下属战争' },
  { level: 4, name: '压榨', desc: '最高上缴，完全控制下属' },
];

// 军/民模板切换映射
const MILITARY_TO_CIVIL: Record<string, string> = {
  'pos-jiedushi': 'pos-guancha-shi',
  'pos-fangyu-shi': 'pos-cishi',
};
const CIVIL_TO_MILITARY: Record<string, string> = {
  'pos-guancha-shi': 'pos-jiedushi',
  'pos-cishi': 'pos-fangyu-shi',
};

interface CentralizationFlowProps {
  targetId: string;
  onClose: () => void;
}

const CentralizationFlow: React.FC<CentralizationFlowProps> = ({ targetId, onClose }) => {
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const charStore = useCharacterStore;
  const territories = useTerritoryStore((s) => s.territories);

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

    if (playerId) {
      const opinion = CENTRALIZATION_OPINION[level] ?? 0;
      store.setOpinion(targetId, playerId, {
        reason: '集权等级',
        value: opinion,
        decayable: false,
      });
    }

    refreshPlayerLedger();
  };

  // 查找 target 持有的 grantsControl 岗位
  const controlPosts: Array<{ post: Post; territoryId: string; territoryName: string; tier: string }> = [];
  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== targetId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      controlPosts.push({
        post,
        territoryId: terr.id,
        territoryName: terr.name,
        tier: terr.tier,
      });
    }
  }

  const handleToggleType = (postEntry: typeof controlPosts[0]) => {
    const terrStore = useTerritoryStore.getState();
    const { post, territoryId } = postEntry;
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return;

    const isMilitary = tpl.territoryType === 'military';
    const newTemplateId = isMilitary
      ? MILITARY_TO_CIVIL[post.templateId]
      : CIVIL_TO_MILITARY[post.templateId];
    if (!newTemplateId) return;

    const newType = isMilitary ? 'civil' as const : 'military' as const;

    // 1. 切换岗位模板
    terrStore.updatePost(post.id, { templateId: newTemplateId });

    // 2. 切换领地类型
    terrStore.updateTerritory(territoryId, { territoryType: newType });

    // 3. 如果是 dao 级，下辖 zhou 也切换
    const terr = terrStore.getTerritory(territoryId);
    if (terr && terr.tier === 'dao' && terr.childIds) {
      for (const childId of terr.childIds) {
        terrStore.updateTerritory(childId, { territoryType: newType });
      }
    }

    refreshPlayerLedger();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--color-accent-gold)]">
            调整对 {target.name} 的权责
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">×</button>
        </div>

        {/* ===== 集权等级 ===== */}
        <div className="mb-3">
          <h4 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5">集权等级</h4>
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

        {/* ===== 职类变更 ===== */}
        {controlPosts.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5">职类变更</h4>
            <div className="space-y-1">
              {controlPosts.map((entry) => {
                const tpl = positionMap.get(entry.post.templateId);
                const isMilitary = tpl?.territoryType === 'military';
                const canToggle = isMilitary
                  ? !!MILITARY_TO_CIVIL[entry.post.templateId]
                  : !!CIVIL_TO_MILITARY[entry.post.templateId];

                return (
                  <div
                    key={entry.post.id}
                    className="flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[var(--color-text)]">{entry.territoryName}</span>
                      <span className="text-xs text-[var(--color-text-muted)] ml-1.5">
                        {tpl?.name ?? ''}
                        <span className={`ml-1 ${isMilitary ? 'text-red-400' : 'text-blue-400'}`}>
                          {isMilitary ? '军事' : '民政'}
                        </span>
                      </span>
                    </div>
                    {canToggle && (
                      <button
                        onClick={() => handleToggleType(entry)}
                        className={`shrink-0 ml-2 px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                          isMilitary
                            ? 'border-blue-400/50 text-blue-400 hover:bg-blue-400/10'
                            : 'border-red-400/50 text-red-400 hover:bg-red-400/10'
                        }`}
                      >
                        转为{isMilitary ? '民政' : '军事'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CentralizationFlow;
