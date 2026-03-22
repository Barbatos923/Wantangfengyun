import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getDynamicTitle, getActualController } from '@engine/official/officialUtils';

/* ------------------------------------------------------------------ */
/*  Static layout data                                                 */
/* ------------------------------------------------------------------ */

interface ZhouLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZHOU_LAYOUTS: ZhouLayout[] = [
  { id: 'zhou-taiyuan',  x: 450, y: 80,  w: 120, h: 80 },
  { id: 'zhou-changan',  x: 250, y: 220, w: 120, h: 80 },
  { id: 'zhou-luoyang',  x: 450, y: 220, w: 120, h: 80 },
  { id: 'zhou-chengdu',  x: 200, y: 400, w: 120, h: 80 },
  { id: 'zhou-yangzhou', x: 650, y: 350, w: 120, h: 80 },
];

interface DaoLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DAO_LAYOUTS: DaoLayout[] = [
  { id: 'dao-guannei', x: 210, y: 190, w: 400, h: 140 },
  { id: 'dao-hedong',  x: 410, y: 50,  w: 200, h: 140 },
];

const EDGES: [string, string][] = [
  ['zhou-changan', 'zhou-luoyang'],
  ['zhou-changan', 'zhou-chengdu'],
  ['zhou-luoyang', 'zhou-taiyuan'],
  ['zhou-luoyang', 'zhou-yangzhou'],
];

const CONTROLLER_PALETTE = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#f39c12', '#2c3e50',
];

function zhouCenter(layout: ZhouLayout): { cx: number; cy: number } {
  return { cx: layout.x + layout.w / 2, cy: layout.y + layout.h / 2 };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface GameMapProps {
  onSelectTerritory?: (id: string) => void;
}

const GameMap: React.FC<GameMapProps> = ({ onSelectTerritory }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
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

  const layoutById = useMemo(() => {
    const m = new Map<string, ZhouLayout>();
    for (const l of ZHOU_LAYOUTS) m.set(l.id, l);
    return m;
  }, []);

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
    setZoom((z) => Math.min(3, Math.max(0.5, z - e.deltaY * 0.001)));
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
      const text = `${t.name}${ctrl ? ' - ' + ctrl.name + ' (' + getDynamicTitle(ctrl, territories) + ')' : ''} | 控${Math.floor(t.control)} 发${Math.floor(t.development)} 民${Math.floor(t.populace)}`;
      setTooltip({ text, x: e.clientX, y: e.clientY });
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
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg, #1a1a2e)' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : 'grab' }}
      >
        <g transform={transform}>
          {/* Dao overlays */}
          {DAO_LAYOUTS.map((dao) => {
            const t = territories.get(dao.id);
            return (
              <g key={dao.id}>
                <rect
                  x={dao.x} y={dao.y} width={dao.w} height={dao.h}
                  rx={12} ry={12}
                  fill="rgba(224, 213, 193, 0.06)"
                  stroke="var(--color-text-muted, #8a8070)"
                  strokeWidth={1} strokeDasharray="8 4"
                  pointerEvents="none"
                />
                {t && (
                  <text
                    x={dao.x + dao.w / 2} y={dao.y + 18}
                    textAnchor="middle"
                    fill="var(--color-text-muted, #8a8070)"
                    fontSize={12} pointerEvents="none"
                  >
                    {t.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* Adjacency edges */}
          {EDGES.map(([a, b]) => {
            const la = layoutById.get(a);
            const lb = layoutById.get(b);
            if (!la || !lb) return null;
            const ca = zhouCenter(la);
            const cb = zhouCenter(lb);
            return (
              <line
                key={`${a}-${b}`}
                x1={ca.cx} y1={ca.cy} x2={cb.cx} y2={cb.cy}
                stroke="#2a2a4a" strokeWidth={1} strokeDasharray="4 4"
                pointerEvents="none"
              />
            );
          })}

          {/* Zhou territories */}
          {ZHOU_LAYOUTS.map((layout) => {
            const t = territories.get(layout.id);
            if (!t) return null;
            const actualControllerId = getActualController(t);
            const ctrl = actualControllerId ? characters.get(actualControllerId) : undefined;
            const fillColor = actualControllerId ? (controllerColorMap.get(actualControllerId) ?? '#555') : '#555';
            const isSelected = selectedId === layout.id;
            const isHovered = hoveredId === layout.id;

            return (
              <g
                key={layout.id}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleZhouClick(layout.id, e)}
                onMouseEnter={(e) => handleZhouEnter(layout.id, e)}
                onMouseMove={handleZhouMove}
                onMouseLeave={handleZhouLeave}
              >
                <rect
                  x={layout.x} y={layout.y} width={layout.w} height={layout.h}
                  rx={8} ry={8}
                  fill={fillColor} fillOpacity={0.6}
                  stroke={isSelected ? 'var(--color-accent-gold, #d4a843)' : '#2a2a4a'}
                  strokeWidth={isSelected ? 3 : 1.5}
                  filter={isHovered ? 'brightness(1.3)' : undefined}
                />
                {isHovered && (
                  <rect
                    x={layout.x} y={layout.y} width={layout.w} height={layout.h}
                    rx={8} ry={8}
                    fill="rgba(255,255,255,0.1)" pointerEvents="none"
                  />
                )}
                <text
                  x={layout.x + layout.w / 2}
                  y={layout.y + layout.h / 2 - (ctrl ? 4 : 0)}
                  textAnchor="middle" dominantBaseline="central"
                  fill="var(--color-text, #e0d5c1)"
                  fontSize={14} fontWeight="bold" pointerEvents="none"
                >
                  {t.name}
                </text>
                {ctrl && (
                  <text
                    x={layout.x + layout.w / 2}
                    y={layout.y + layout.h / 2 + 14}
                    textAnchor="middle" dominantBaseline="central"
                    fill="var(--color-text, #e0d5c1)"
                    fontSize={11} opacity={0.75} pointerEvents="none"
                  >
                    {ctrl.name}
                  </text>
                )}
              </g>
            );
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
            background: 'rgba(26, 26, 46, 0.95)',
            color: 'var(--color-text, #e0d5c1)',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 13,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            border: '1px solid var(--color-border, #2a2a4a)',
            zIndex: 10,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};

export default GameMap;
