import { useState, useEffect } from 'react';
import type { PoolStatus } from '@lacc/shared';
import { Button } from './ui/Button.js';
import { FolderPickerModal } from './FolderPickerModal.js';

interface Props {
  pool: PoolStatus;
  sessionCost: number;
  repoPaths: string[];
  activeRepo: string | null;
  onRepoSelect: (repo: string | null) => void;
  onAddRepo: (path: string) => void;
  onRemoveRepo: (path: string) => void;
  onNew: () => void;
  rateLimitRetryAfter?: number | null;
}

export function TopBar({ pool, sessionCost, repoPaths, activeRepo, onRepoSelect, onAddRepo, onRemoveRepo, onNew, rateLimitRetryAfter }: Props) {
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: 40,
          borderBottom: '1px solid #13131f',
          background: '#060610',
          flexShrink: 0,
        }}
      >
        {/* Left side: logo + repo tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.15em', fontSize: 13, color: 'var(--text-bright)' }}>
            LACC
          </span>
          <span style={{ color: '#2a2a3e', fontSize: 14 }}>│</span>

          {/* Repo tabs */}
          <div className="flex items-center gap-1">
            <RepoTab active={activeRepo === null} onClick={() => onRepoSelect(null)}>
              All
            </RepoTab>

            {repoPaths.map(r => {
              const name = r.split('/').pop() || r;
              const active = activeRepo === r;
              return (
                <div key={r} className="flex items-center">
                  <RepoTab active={active} onClick={() => onRepoSelect(active ? null : r)} title={r}>
                    {name}
                  </RepoTab>
                  <button
                    onClick={() => onRemoveRepo(r)}
                    title={`Remove ${r}`}
                    className={`-ml-px px-1 py-0.5 text-xs rounded-r border border-l-0 cursor-pointer font-mono transition-colors duration-100 ${active ? 'bg-surface-active border-border-accent text-text-ghost hover:text-text-muted' : 'bg-transparent border-transparent text-text-ghost hover:text-text-muted hover:border-border-emphasis'}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setShowFolderPicker(true)}
              className="px-2 py-0.5 text-xs rounded border border-dashed border-border-emphasis text-text-ghost cursor-pointer font-mono bg-transparent hover:border-border-accent hover:text-text-muted transition-colors duration-100"
            >
              + repo
            </button>
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {rateLimitRetryAfter != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <span style={{ color: 'var(--text-ghost)' }}>autoresume after</span>
              <RateLimitCountdown retryAfter={rateLimitRetryAfter} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: '#4ade80' }}>{pool.ready}</span> active
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>session</span>
            <span style={{ color: '#f0c040', fontWeight: 600 }}>${sessionCost.toFixed(4)}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onNew}
            title="New task (N)"
            kbd="N"
            style={{ color: '#aaa', padding: '4px 10px' }}
          >
            + New
          </Button>

        </div>
      </div>

      {showFolderPicker && (
        <FolderPickerModal
          onSelect={p => { onAddRepo(p); setShowFolderPicker(false); }}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </>
  );
}

function RateLimitCountdown({ retryAfter }: { retryAfter: number }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const ms = retryAfter - Date.now();
      if (ms <= 0) { setRemaining('ready'); return; }
      const s = Math.ceil(ms / 1000);
      const m = Math.floor(s / 60);
      setRemaining(m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  return (
    <span style={{ color: '#fb923c', fontFamily: 'monospace', fontSize: 13 }}>{remaining}</span>
  );
}

function RepoTab({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-0.5 text-xs rounded-l border cursor-pointer font-mono transition-colors duration-100 ${active ? 'bg-surface-active border-border-accent text-text-bright' : 'bg-transparent border-transparent text-text-ghost hover:text-text-muted hover:bg-surface-hover'}`}
    >
      {children}
    </button>
  );
}
