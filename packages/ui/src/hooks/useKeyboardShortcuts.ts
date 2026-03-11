import { useEffect, useRef } from 'react';

interface Shortcuts {
  onNew?: () => void;
  onNextTask?: () => void;
  onPrevTask?: () => void;
  onTabTerminal?: () => void;
  onTabDiff?: () => void;
  onTabPreview?: () => void;
  onComplete?: () => void;
  onDiscard?: () => void;
  onFeedback?: () => void;
  onOpenEditor?: () => void;
  onOpenBrowser?: () => void;
  onKill?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRestart?: () => void;
  onSettings?: () => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  // Keep a stable ref so the listener never needs to be re-registered when
  // callbacks change identity (which happens on every render when passed inline).
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = ref.current;
      if (s.disabled) return;

      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toUpperCase();

      if (meta && e.key === ',') { e.preventDefault(); s.onSettings?.(); return; }

      if (key === 'N' && !meta) { e.preventDefault(); s.onNew?.(); return; }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); s.onNextTask?.(); return; }
      if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); s.onPrevTask?.(); return; }
      if (e.key === '1') { s.onTabTerminal?.(); return; }
      if (e.key === '2') { s.onTabDiff?.(); return; }
      if (e.key === '3') { s.onTabPreview?.(); return; }
      if (meta) return;
      if (key === 'A') { s.onComplete?.(); return; }
      if (key === 'X') { s.onDiscard?.(); return; }
      if (key === 'F') { s.onFeedback?.(); return; }
      if (key === 'O') { s.onOpenEditor?.(); return; }
      if (key === 'B') { s.onOpenBrowser?.(); return; }
      if (key === 'K') { s.onKill?.(); return; }
      if (key === 'P') { s.onPause?.(); return; }
      if (key === 'R') { s.onRestart?.(); return; }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // registers once, reads latest shortcuts via ref
}
