import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getDynamicTitle, getActualController } from '@engine/official/officialUtils';
import { ALL_EDGES, passMap } from '@data/mapTopology';

import { useWarStore } from '@engine/military/WarStore';

/* ------------------------------------------------------------------ */
/*  Static layout data                                                 */
/* ------------------------------------------------------------------ */

interface ZhouPos {
  id: string;
  x: number;
  y: number;
  r: number;
}

// 49州坐标 — 基于晚唐真实地理，viewBox 0 0 1600 1000
const ZHOU_POSITIONS: ZhouPos[] = [
  // 京畿道
  { id: 'zhou-changan',    x: 420, y: 380, r: 16 },
  { id: 'zhou-fengxiang',  x: 340, y: 350, r: 12 },

  // 关内道
  { id: 'zhou-binzhou',    x: 380, y: 300, r: 12 },
  { id: 'zhou-fangzhou',   x: 430, y: 260, r: 12 },
  { id: 'zhou-tongzhou',   x: 500, y: 370, r: 12 },
  { id: 'zhou-lingzhou',   x: 280, y: 220, r: 12 },
  { id: 'zhou-xiazhou',    x: 350, y: 200, r: 12 },

  // 都畿道
  { id: 'zhou-luoyang',    x: 620, y: 380, r: 16 },
  { id: 'zhou-shanzhou',   x: 560, y: 370, r: 12 },

  // 河东道
  { id: 'zhou-taiyuan',    x: 580, y: 250, r: 16 },
  { id: 'zhou-luzhou',     x: 620, y: 310, r: 12 },
  { id: 'zhou-hezhong',    x: 540, y: 330, r: 12 },
  { id: 'zhou-yunzhou',    x: 580, y: 160, r: 12 },

  // 河北道·幽州
  { id: 'zhou-youzhou',    x: 760, y: 140, r: 16 },
  { id: 'zhou-yingzhou',   x: 730, y: 200, r: 12 },
  { id: 'zhou-dingzhou',   x: 700, y: 180, r: 12 },

  // 河北道·成德
  { id: 'zhou-zhenzhou',   x: 700, y: 240, r: 12 },
  { id: 'zhou-jizhou',     x: 720, y: 280, r: 12 },

  // 河北道·魏博
  { id: 'zhou-weizhou',    x: 720, y: 330, r: 12 },
  { id: 'zhou-xiangzhou',  x: 670, y: 340, r: 12 },

  // 河南道
  { id: 'zhou-bianzhou',   x: 700, y: 400, r: 16 },
  { id: 'zhou-huazhou',    x: 680, y: 370, r: 12 },
  { id: 'zhou-yunzhou-sd', x: 760, y: 360, r: 12 },
  { id: 'zhou-yanzhou',    x: 780, y: 400, r: 12 },
  { id: 'zhou-xuzhou',     x: 810, y: 430, r: 12 },
  { id: 'zhou-qingzhou',   x: 850, y: 320, r: 12 },
  { id: 'zhou-xuchang',    x: 680, y: 450, r: 12 },
  { id: 'zhou-caizhou',    x: 660, y: 490, r: 12 },

  // 山南东道
  { id: 'zhou-xiangyang',  x: 600, y: 490, r: 12 },
  { id: 'zhou-jiangling',  x: 560, y: 550, r: 12 },
  { id: 'zhou-ezhou',      x: 640, y: 550, r: 12 },

  // 山南西道
  { id: 'zhou-xingyuan',   x: 380, y: 430, r: 12 },
  { id: 'zhou-suizhou',    x: 370, y: 500, r: 12 },

  // 淮南道
  { id: 'zhou-yangzhou',   x: 840, y: 480, r: 16 },

  // 江南东道
  { id: 'zhou-runzhou',    x: 850, y: 530, r: 12 },
  { id: 'zhou-yuezhou',    x: 900, y: 590, r: 12 },
  { id: 'zhou-fuzhou',     x: 920, y: 660, r: 12 },
  { id: 'zhou-xuanzhou',   x: 820, y: 560, r: 12 },

  // 江南西道
  { id: 'zhou-hongzhou',   x: 760, y: 620, r: 12 },
  { id: 'zhou-tanzhou',    x: 660, y: 640, r: 12 },

  // 剑南道
  { id: 'zhou-chengdu',    x: 300, y: 510, r: 16 },
  { id: 'zhou-zizhou',     x: 340, y: 470, r: 12 },

  // 岭南道
  { id: 'zhou-guangzhou',  x: 760, y: 780, r: 16 },
  { id: 'zhou-yongzhou',   x: 580, y: 780, r: 12 },
  { id: 'zhou-guizhou',    x: 620, y: 730, r: 12 },
  { id: 'zhou-jiaozhou',   x: 520, y: 830, r: 12 },

  // 陇右道
  { id: 'zhou-jingzhou-ly', x: 320, y: 330, r: 12 },
  { id: 'zhou-qinzhou',    x: 300, y: 380, r: 12 },

  // 河西道
  { id: 'zhou-shazhou',    x: 120, y: 200, r: 12 },
];

const CONTROLLER_PALETTE = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#f39c12', '#2c3e50',
  '#1abc9c', '#e74c3c', '#3498db', '#9b59b6',
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
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Read from Zustand stores
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);


  const controllerColorMap = useMemo(() => {
    const ids = new Set<string>();
    territories.forEach((t) => {
      if (t.tier === 'zhou') {
        const cid = getActualController(t);
        if (cid) ids.add(cid);
      }
    });
    const map = new Map<string, string>();
    let idx = 0;
    ids.forEach((cid) => {
      map.set(cid, CONTROLLER_PALETTE[idx % CONTROLLER_PALETTE.length]);
      idx++;
    });
    return map;
  }, [territories]);

  // posById 查找表
  const posById = useMemo(() => {
    const m = new Map<string, ZhouPos>();
    for (const p of ZHOU_POSITIONS) m.set(p.id, p);
    return m;
  }, []);


  // 行营数据
  const campaignData = useWarStore((s) => s.campaigns);
  const playerId = useCharacterStore((s) => s.playerId);
  const campaignsByLocation = useMemo(() => {
    const m = new Map<string, { id: string; isPlayer: boolean; status: string }[]>();
    campaignData.forEach((c) => {
      let list = m.get(c.locationId);
      if (!list) { list = []; m.set(c.locationId, list); }
      list.push({ id: c.id, isPlayer: c.ownerId === playerId, status: c.status });
    });
    return m;
  }, [campaignData, playerId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
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
        <g transform={transform}>
          {/* 1. 连线层 */}
          {ALL_EDGES.map((edge) => {
            const a = posById.get(edge.from);
            const b = posById.get(edge.to);
            if (!a || !b) return null;
            const hasPass = !!edge.passId;
            const isWater = edge.type === 'water';
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const pass = hasPass ? passMap.get(edge.passId!) : undefined;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={hasPass ? '#c0392b' : isWater ? '#2980b9' : '#4a4a7a'}
                  strokeWidth={hasPass ? 2 : 1}
                  strokeDasharray={isWater ? '6 3' : hasPass ? '4 2' : undefined}
                  opacity={0.55}
                  pointerEvents="none"
                />
                {pass && (
                  <text
                    x={mx} y={my - 6}
                    textAnchor="middle"
                    fill="#c0392b"
                    fontSize={9}
                    opacity={0.9}
                    pointerEvents="none"
                  >
                    {pass.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* 2. 州节点层 */}
          {ZHOU_POSITIONS.map((pos) => {
            const t = territories.get(pos.id);
            if (!t) return null;
            const controllerId = getActualController(t);
            const fillColor = controllerId
              ? (controllerColorMap.get(controllerId) ?? '#555')
              : '#555';
            const isSelected = selectedId === pos.id;
            const isHovered = hoveredId === pos.id;

            return (
              <g
                key={pos.id}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleZhouClick(pos.id, e)}
                onMouseEnter={(e) => handleZhouEnter(pos.id, e)}
                onMouseMove={handleZhouMove}
                onMouseLeave={handleZhouLeave}
              >
                {/* 选中时的光晕 */}
                {isSelected && (
                  <circle
                    cx={pos.x} cy={pos.y} r={pos.r + 5}
                    fill="none"
                    stroke="#d4a843"
                    strokeWidth={2}
                    opacity={0.6}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={pos.x} cy={pos.y} r={pos.r}
                  fill={fillColor}
                  fillOpacity={isHovered ? 0.95 : 0.75}
                  stroke={isSelected ? '#d4a843' : isHovered ? '#c8bfa8' : '#2a2a4a'}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                {/* 州名标签 */}
                <text
                  x={pos.x}
                  y={pos.y + pos.r + 12}
                  textAnchor="middle"
                  fill="#e0d5c1"
                  fontSize={pos.r >= 16 ? 11 : 10}
                  fontWeight={pos.r >= 16 ? 'bold' : 'normal'}
                  pointerEvents="none"
                >
                  {t.name}
                </text>
              </g>
            );
          })}

          {/* 行营兵棋 */}
          {Array.from(campaignsByLocation.entries()).map(([locId, camps]) => {
            const pos = posById.get(locId);
            if (!pos) return null;
            return camps.map((camp, idx) => {
              const cx = pos.x + pos.r + 8 + idx * 16;
              const cy = pos.y - pos.r - 4;
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
