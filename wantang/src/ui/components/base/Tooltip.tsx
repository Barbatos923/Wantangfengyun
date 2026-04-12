import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** tooltip 内容，支持 ReactNode 富内容 */
  content: React.ReactNode;
  /** 期望方向，默认 bottom。如果空间不足会自动翻转 */
  position?: TooltipPosition;
  /** 禁用 tooltip（content 为空时也自动禁用） */
  disabled?: boolean;
  children: React.ReactElement;
}

const OFFSET = 8;
const SHOW_DELAY = 150;

/**
 * Passive Tooltip — 只读信息浮层，pointer-events: none。
 * 如果需要可交互浮层（按钮/链接），应另建 Popover 组件。
 */
export function Tooltip({ content, position = 'bottom', disabled, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [finalPos, setFinalPos] = useState<TooltipPosition>(position);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled || !content) return;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY);
  }, [disabled, content]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  // 渲染后测量真实 tooltip 尺寸，计算位置 + 视口边界修正
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tt = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let pos = position;
    let top = 0;
    let left = 0;

    const calcPos = (p: TooltipPosition) => {
      switch (p) {
        case 'bottom':
          top = rect.bottom + OFFSET;
          left = rect.left + rect.width / 2;
          break;
        case 'top':
          top = rect.top - OFFSET;
          left = rect.left + rect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - OFFSET;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + OFFSET;
          break;
      }
    };

    calcPos(pos);

    // 边界修正：用真实 tooltip 尺寸判断翻转
    if (pos === 'bottom' && top + tt.height > vh) { pos = 'top'; calcPos(pos); }
    else if (pos === 'top' && top - tt.height < 0) { pos = 'bottom'; calcPos(pos); }
    else if (pos === 'right' && left + tt.width > vw) { pos = 'left'; calcPos(pos); }
    else if (pos === 'left' && left - tt.width < 0) { pos = 'right'; calcPos(pos); }

    // 水平越界修正（top/bottom 模式下居中可能溢出）
    if (pos === 'top' || pos === 'bottom') {
      const halfW = tt.width / 2;
      if (left - halfW < 4) left = halfW + 4;
      if (left + halfW > vw - 4) left = vw - halfW - 4;
    }

    setFinalPos(pos);
    setCoords({ top, left });
  }, [visible, position]);

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (disabled || !content) return children;

  const transformOrigin: Record<TooltipPosition, string> = {
    bottom: 'top center',
    top: 'bottom center',
    left: 'center right',
    right: 'center left',
  };

  const getTransform = (p: TooltipPosition) => {
    switch (p) {
      case 'bottom': return 'translateX(-50%)';
      case 'top': return 'translateX(-50%) translateY(-100%)';
      case 'left': return 'translateX(-100%) translateY(-50%)';
      case 'right': return 'translateY(-50%)';
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </div>
      {visible && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            transform: coords ? getTransform(finalPos) : undefined,
            transformOrigin: transformOrigin[finalPos],
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'var(--color-bg-panel)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            padding: '8px 12px',
            maxWidth: '320px',
            color: 'var(--color-text)',
            fontSize: 'var(--text-sm)',
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
