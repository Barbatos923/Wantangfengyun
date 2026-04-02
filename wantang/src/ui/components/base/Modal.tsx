import React from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
};

const heightClass: Record<ModalSize, string> = {
  sm: 'max-h-[80vh]',
  md: 'max-h-[80vh]',
  lg: 'max-h-[80vh]',
  xl: 'max-h-[90vh]',
};

interface ModalProps {
  size?: ModalSize;
  zIndex?: number;
  onOverlayClick?: () => void;
  children: React.ReactNode;
}

export function Modal({ size = 'md', zIndex = 40, onOverlayClick, children }: ModalProps) {
  return (
    <div
      className="modal-overlay"
      style={{ zIndex }}
      onClick={onOverlayClick}
    >
      <div
        className={`modal-panel w-full mx-4 flex flex-col overflow-hidden ${sizeClass[size]} ${heightClass[size]}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
