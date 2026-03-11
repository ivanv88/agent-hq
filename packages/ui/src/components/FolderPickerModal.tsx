import { useState, useEffect } from 'react';
import { ModalOverlay } from './ui/ModalOverlay.js';
import { Button } from './ui/Button.js';

interface BrowseResult {
  current: string;
  parent: string | null;
  dirs: Array<{ name: string; path: string }>;
}

interface Props {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function FolderPickerModal({ initialPath, onSelect, onClose }: Props) {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);

  const browse = (p?: string) => {
    setLoading(true);
    const url = p ? `/fs/browse?path=${encodeURIComponent(p)}` : '/fs/browse';
    fetch(url)
      .then(r => r.json())
      .then((d: BrowseResult) => setResult(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { browse(initialPath); }, []);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        <h2 className="text-text-heading text-sm font-semibold m-0">
          Select Folder
        </h2>

        <div className="text-xs text-text-muted break-all bg-surface-base px-2.5 py-1.5 rounded">
          {result?.current ?? '…'}
        </div>

        <div className="border border-border-emphasis rounded bg-surface-base max-h-[280px] overflow-y-auto">
          {result?.parent && (
            <DirRow onClick={() => browse(result.parent!)} dim>
              ↑ ..
            </DirRow>
          )}
          {loading && (
            <div className="px-3 py-3 text-text-disabled text-sm">Loading…</div>
          )}
          {!loading && result?.dirs.length === 0 && (
            <div className="px-3 py-3 text-text-disabled text-sm">No subdirectories</div>
          )}
          {!loading && result?.dirs.map(d => (
            <DirRow key={d.path} onClick={() => browse(d.path)}>
              📁 {d.name}
            </DirRow>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => { if (result) { onSelect(result.current); onClose(); } }}
            disabled={!result}
          >
            Select "{result?.current.split('/').pop() || '/'}"
          </Button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function DirRow({ onClick, dim, children }: { onClick: () => void; dim?: boolean; children: React.ReactNode }) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 text-sm font-mono cursor-pointer bg-transparent border-none border-b border-border-subtle transition-colors duration-100 hover:bg-surface-hover ${dim ? 'text-text-ghost hover:text-text-muted' : 'text-text-default hover:text-text-bright'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
