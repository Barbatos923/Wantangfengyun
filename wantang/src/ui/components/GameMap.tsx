import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getDynamicTitle, getActualController } from '@engine/official/officialUtils';
import { ZHOU_POSITIONS, posById, ALL_EDGES } from '@data/mapTopology';
import { voronoiCells, sharedEdges, realmOutlinePath } from '@data/mapVoronoi';
import { useWarStore } from '@engine/military/WarStore';
import { usePanelStore } from '@ui/stores/panelStore';
import { computeMapDisplay } from '@engine/official/mapDisplay';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const CONTROLLER_PALETTE = [
  // 第 1 组：高饱和主色
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#f39c12', '#e67e22',
  // 第 2 组：变体
  '#1abc9c', '#e74c3c', '#3498db', '#9b59b6',
  '#2c3e50', '#d4a843', '#7f8c8d', '#c23b22',
  // 第 3 组：深色系
  '#1a5276', '#196f3d', '#6c3483', '#b9770e',
  '#148f77', '#922b21', '#2471a3', '#7d3c98',
  // 第 4 组：补充色
  '#a04000', '#117a65', '#b03a2e', '#2e4053',
  '#76448a', '#1e8449', '#b7950b', '#2874a6',
  // 第 5 组：浅调
  '#cb4335', '#5dade2', '#52be80', '#af7ac5',
  '#eb984e', '#45b39d', '#f4d03f', '#85929e',
  // 第 6 组：暗调
  '#7b241c', '#1b4f72', '#0e6655', '#4a235a',
  '#784212', '#0b5345', '#7e5109', '#1a237e',
  // 第 7 组：冷暖混合
  '#a93226', '#2e86c1', '#229954', '#884ea0',
  '#ca6f1e', '#138d75', '#d68910', '#566573',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface GameMapProps {
  onSelectTerritory?: (id: string) => void;
  onSelectCampaign?: (campaignId: string) => void;
}

const GameMap: React.FC<GameMapProps> = ({ onSelectTerritory, onSelectCampaign }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ lines: string[]; x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isPanning = useRef(false);
  const hasDragged = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);
  const playerId = useCharacterStore((s) => s.playerId) ?? '';
  const mapFocusCharId = usePanelStore((s) => s.mapFocusCharId);

  // 计算着色映射
  const displayResult = useMemo(
    () => computeMapDisplay(territories, characters, playerId, mapFocusCharId),
    [territories, characters, playerId, mapFocusCharId],
  );

  // charId → 颜色（哈希 + 相邻碰撞检测）
  const charColorMap = useMemo(() => {
    const paletteLen = CONTROLLER_PALETTE.length;

    function hashIdx(id: string): number {
      let h = 0;
      for (let i = 0; i < id.length; i++) {
        h = ((h << 5) - h + id.charCodeAt(i)) | 0;
      }
      return ((h % paletteLen) + paletteLen) % paletteLen;
    }

    // 建立着色角色之间的相邻关系（通过 sharedEdges）
    const { zhouColorMap } = displayResult;
    const neighbors = new Map<string, Set<string>>();
    for (const se of sharedEdges) {
      const cA = zhouColorMap.get(se.from);
      const cB = zhouColorMap.get(se.to);
      if (cA && cB && cA !== cB) {
        let sA = neighbors.get(cA);
        if (!sA) { sA = new Set(); neighbors.set(cA, sA); }
        sA.add(cB);
        let sB = neighbors.get(cB);
        if (!sB) { sB = new Set(); neighbors.set(cB, sB); }
        sB.add(cA);
      }
    }

    // 分配颜色：哈希起始 + 碰撞偏移
    const map = new Map<string, number>(); // charId → paletteIndex
    const result = new Map<string, string>();
    const allCharIds = [...new Set(zhouColorMap.values())];

    for (const charId of allCharIds) {
      let idx = hashIdx(charId);
      const neighborChars = neighbors.get(charId);
      // 检查是否与已分配颜色的相邻势力碰撞，最多尝试 paletteLen 次
      for (let attempt = 0; attempt < paletteLen; attempt++) {
        let conflict = false;
        if (neighborChars) {
          for (const nb of neighborChars) {
            if (map.has(nb) && map.get(nb) === idx) {
              conflict = true;
              break;
            }
          }
        }
        if (!conflict) break;
        idx = (idx + 1) % paletteLen;
      }
      map.set(charId, idx);
      result.set(charId, CONTROLLER_PALETTE[idx]);
    }

    return result;
  }, [displayResult]);

  // 行营数据
  const campaignData = useWarStore((s) => s.campaigns);
  const campaignsByLocation = useMemo(() => {
    const m = new Map<string, { id: string; isPlayer: boolean; status: string }[]>();
    campaignData.forEach((c) => {
      let list = m.get(c.locationId);
      if (!list) { list = []; m.set(c.locationId, list); }
      list.push({ id: c.id, isPlayer: c.ownerId === playerId, status: c.status });
    });
    return m;
  }, [campaignData, playerId]);

  // ── 交互事件 ──

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    hasDragged.current = false;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged.current = true;
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  const handleZhouClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasDragged.current) return; // 拖拽后不触发点击
      setSelectedId(id);
      onSelectTerritory?.(id);
    },
    [onSelectTerritory],
  );

  const handleZhouEnter = useCallback(
    (id: string, e: React.MouseEvent) => {
      setHoveredId(id);
      const t = territories.get(id);
      if (!t) return;
      const ctrlId = getActualController(t);
      const ctrl = ctrlId ? characters.get(ctrlId) : undefined;
      const ctrlTitle = ctrl ? getDynamicTitle(ctrl, territories) : '';
      const parentT = t.parentId ? territories.get(t.parentId) : undefined;
      const lines = [
        `${t.name}${parentT ? `（${parentT.name}）` : ''}`,
        `统治者: ${ctrl ? `${ctrl.name}${ctrlTitle ? ' · ' + ctrlTitle : ''}` : '无'}`,
        `控${Math.floor(t.control)} 发${Math.floor(t.development)} 民${Math.floor(t.populace)}`,
        `户${t.basePopulation.toLocaleString()}`,
      ];
      setTooltip({ lines, x: e.clientX, y: e.clientY });
    },
    [territories, characters],
  );

  const handleZhouMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  }, []);

  const handleZhouLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--color-bg, #1a1a2e)',
        userSelect: 'none',
        cursor: isPanning.current ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        style={{ display: 'block' }}
      >
        <defs>
          <clipPath id="realm-clip">
            <path d={realmOutlinePath} />
          </clipPath>
        </defs>
        <g transform={transform}>
          {/* 0. 疆域底色 */}
          <path
            d={realmOutlinePath}
            fill="#0d1117"
            stroke="#2a2a4a"
            strokeWidth={2}
            opacity={0.8}
          />

          {/* 1. 州多边形层（用疆域轮廓裁剪） */}
          <g clipPath="url(#realm-clip)">
          {ZHOU_POSITIONS.map((pos) => {
            const cell = voronoiCells.get(pos.id);
            const t = territories.get(pos.id);
            if (!cell || !t) return null;
            const colorCharId = displayResult.zhouColorMap.get(pos.id);
            const fillColor = colorCharId
              ? (charColorMap.get(colorCharId) ?? '#555')
              : '#555';
            const isSelected = selectedId === pos.id;
            const isHovered = hoveredId === pos.id;

            return (
              <path
                key={pos.id}
                d={cell.path}
                fill={fillColor}
                fillOpacity={isHovered ? 0.92 : 0.75}
                stroke={isSelected ? '#d4a843' : 'none'}
                strokeWidth={isSelected ? 3 : 0}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleZhouClick(pos.id, e)}
                onMouseEnter={(e) => handleZhouEnter(pos.id, e)}
                onMouseMove={handleZhouMove}
                onMouseLeave={handleZhouLeave}
              />
            );
          })}

          {/* 2. 边界线层 */}
          {sharedEdges.map((se) => {
            const colorA = displayResult.zhouColorMap.get(se.from);
            const colorB = displayResult.zhouColorMap.get(se.to);
            const topA = displayResult.zhouTopLordMap.get(se.from);
            const topB = displayResult.zhouTopLordMap.get(se.to);
            const isSameColor = colorA && colorB && colorA === colorB;
            const isMajorBorder = topA !== topB;
            const isPlayerBorder = !isSameColor && (topA === playerId || topB === playerId);

            let stroke: string;
            let strokeWidth: number;
            let opacity: number;
            if (isPlayerBorder) {
              stroke = '#d4a843'; strokeWidth = 2.5; opacity = 0.7;
            } else if (isMajorBorder) {
              stroke = '#0d0d1a'; strokeWidth = 2.5; opacity = 0.8;
            } else if (!isSameColor) {
              stroke = '#1a1a3a'; strokeWidth = 1.5; opacity = 0.5;
            } else {
              stroke = '#2a2a4a'; strokeWidth = 0.8; opacity = 0.3;
            }

            return se.segments.map((seg, idx) => (
              <line
                key={`${se.from}-${se.to}-${idx}`}
                x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                pointerEvents="none"
              />
            ));
          })}
          </g>

          {/* 3. 道路层 */}
          {ALL_EDGES.map((edge) => {
            const a = posById.get(edge.from);
            const b = posById.get(edge.to);
            if (!a || !b) return null;
            const isWater = edge.type === 'water';
            return (
              <line
                key={`road-${edge.from}-${edge.to}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isWater ? '#2980b9' : '#c8bfa8'}
                strokeWidth={isWater ? 1 : 0.8}
                strokeDasharray={isWater ? '4 3' : '3 4'}
                opacity={isWater ? 0.5 : 0.3}
                pointerEvents="none"
              />
            );
          })}

          {/* 4. 标签层 */}
          {ZHOU_POSITIONS.map((pos) => {
            const cell = voronoiCells.get(pos.id);
            const t = territories.get(pos.id);
            if (!cell || !t) return null;

            return (
              <g key={`label-${pos.id}`} pointerEvents="none">
                {/* 州名（用原始坐标点，保证在可见区域内） */}
                <text
                  x={pos.x}
                  y={pos.y + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#e0d5c1"
                  fontSize={10}
                  fontWeight="normal"
                  style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                >
                  {t.name}
                </text>
                {/* 关隘标签 */}
                {t.passName && (
                  <text
                    x={pos.x}
                    y={pos.y - 12}
                    textAnchor="middle"
                    fill="#c0392b"
                    fontSize={8}
                    opacity={0.9}
                    style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                  >
                    {t.passName}
                  </text>
                )}
              </g>
            );
          })}

          {/* 4. 行营兵棋 */}
          {Array.from(campaignsByLocation.entries()).map(([locId, camps]) => {
            const zhouPos = posById.get(locId);
            if (!zhouPos) return null;
            return camps.map((camp, idx) => {
              const cx = zhouPos.x + 20 + idx * 16;
              const cy = zhouPos.y - 14;
              const color = camp.isPlayer ? '#d4a843' : '#c0392b';
              const marchChar = camp.status === 'marching' ? '→' : camp.status === 'sieging' ? '⊕' : '⚑';
              return (
                <g
                  key={camp.id}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onSelectCampaign?.(camp.id); }}
                >
                  <rect
                    x={cx - 7} y={cy - 7} width={14} height={14} rx={2}
                    fill={color} fillOpacity={0.9}
                    stroke="#1a1a2e" strokeWidth={1}
                  />
                  <text
                    x={cx} y={cy + 1}
                    textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize={9} fontWeight="bold" pointerEvents="none"
                  >
                    {marchChar}
                  </text>
                </g>
              );
            });
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 14,
            top: tooltip.y - 30,
            background: 'rgba(26, 26, 46, 0.96)',
            color: 'var(--color-text, #e0d5c1)',
            padding: '6px 12px',
            borderRadius: 5,
            fontSize: 12,
            lineHeight: '1.7',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            border: '1px solid var(--color-border, #3a3a6a)',
            zIndex: 10,
          }}
        >
          {tooltip.lines.map((line, i) => (
            <div key={i} style={i === 0 ? { fontWeight: 'bold', fontSize: 13 } : undefined}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GameMap;
