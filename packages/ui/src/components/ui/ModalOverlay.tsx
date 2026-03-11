import { useEffect } from 'react';
import { Button } from './Button.js';

interface ModalOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}

export function ModalOverlay({ children, onClose, className }: ModalOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`animate-fade-up w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto bg-surface-raised border border-[var(--border3)] rounded-lg p-7 relative ${className ?? ''}`}>
        <Button
          variant="icon"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-lg leading-none"
        >
          ×
        </Button>
        {children}
      </div>
    </div>
  );
}
