import React from 'react';

interface AlertItem {
  id: string;
  label: string;
  icon: string;
}

const alerts: AlertItem[] = [
  { id: 'heir', label: '未指定继承人', icon: '⚠' },
  { id: 'yajun', label: '牙兵状态危急', icon: '🔴' },
  { id: 'famine', label: '河南道饥荒', icon: '🌾' },
];

const AlertBar: React.FC = () => {
  return (
    <div className="flex items-center gap-2 p-3">
      <button className="relative flex items-center gap-1.5 bg-[var(--color-bg-surface)] text-[var(--color-text)] px-3 py-1.5 rounded text-sm hover:brightness-110 transition-all">
        <span>📋</span>
        <span>当前形势</span>
        <span className="absolute -top-1.5 -right-1.5 bg-[var(--color-accent-red)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
          3
        </span>
      </button>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-1 bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] px-2.5 py-1 rounded text-xs hover:text-[var(--color-text)] cursor-pointer transition-colors"
        >
          <span>{alert.icon}</span>
          <span>{alert.label}</span>
        </div>
      ))}
    </div>
  );
};

export default AlertBar;
