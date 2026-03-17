import { useState, useEffect } from 'react';
import type { PoolStatus } from '@lacc/shared';
import { Container, Clock, CalendarDays } from 'lucide-react';
import { Button } from './ui/Button.js';
import { FolderPickerModal } from './FolderPickerModal.js';

interface Props {
  pool: PoolStatus;
  sessionCost: number;
  sessionTokens: number;
  weeklyTokens: number;
  sessionTokenLimit: number;
  weeklyTokenLimit: number;
  hasApiKey: boolean;
  repoPaths: string[];
  activeRepo: string | null;
  onRepoSelect: (repo: string | null) => void;
  onAddRepo: (path: string) => void;
  onRemoveRepo: (path: string) => void;
  onNew: () => void;
  rateLimitRetryAfter?: number | null;
}

export function TopBar({ pool, sessionCost, sessionTokens, weeklyTokens, sessionTokenLimit, weeklyTokenLimit, hasApiKey, repoPaths, activeRepo, onRepoSelect, onAddRepo, onRemoveRepo, onNew, rateLimitRetryAfter }: Props) {
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
              <span style={{ color: '#fb923c' }}>⏸ rate limited</span>
              <span style={{ color: 'var(--text-ghost)' }}>·</span>
              <RateLimitCountdown retryAfter={rateLimitRetryAfter} />
            </div>
          )}

          <div className="flex items-center gap-1.5 text-sm">
            <Container size={13} className="text-text-ghost" />
            <span className="text-status-working font-semibold">{pool.ready}</span>
          </div>

          <span className="text-border-emphasis text-sm select-none">│</span>

          {hasApiKey ? (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-text-muted">session</span>
              <span className="text-status-ready font-semibold">${sessionCost.toFixed(4)}</span>
            </div>
          ) : (
            <UsageGauge
              sessionTokens={sessionTokens}
              weeklyTokens={weeklyTokens}
              sessionTokenLimit={sessionTokenLimit}
              weeklyTokenLimit={weeklyTokenLimit}
            />
          )}

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

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
  return `${tokens}`;
}

function usageColorClass(pct: number): string {
  if (pct >= 85) return 'text-status-failed';
  if (pct >= 60) return 'text-status-ready';
  return 'text-status-working';
}

function UsageGauge({ sessionTokens, weeklyTokens, sessionTokenLimit, weeklyTokenLimit }: {
  sessionTokens: number;
  weeklyTokens: number;
  sessionTokenLimit: number;
  weeklyTokenLimit: number;
}) {
  const sessionPct = sessionTokenLimit > 0 ? Math.min(100, (sessionTokens / sessionTokenLimit) * 100) : 0;
  const weeklyPct  = weeklyTokenLimit  > 0 ? Math.min(100, (weeklyTokens  / weeklyTokenLimit)  * 100) : 0;

  const tooltipText = [
    sessionTokenLimit > 0
      ? `Session: ${formatTokens(sessionTokens)} / ${formatTokens(sessionTokenLimit)} tokens (${Math.round(sessionPct)}%)`
      : `Session: ${formatTokens(sessionTokens)} tokens`,
    weeklyTokenLimit > 0
      ? `Week: ${formatTokens(weeklyTokens)} / ${formatTokens(weeklyTokenLimit)} tokens (${Math.round(weeklyPct)}%)`
      : `Week: ${formatTokens(weeklyTokens)} tokens`,
  ].join('\n');

  return (
    <div className="group relative flex items-center gap-2 text-sm">
      <div className="pointer-events-none absolute top-full right-0 mt-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
        <div className="bg-surface-overlay border border-border-emphasis text-text-body text-[11px] px-2 py-1 rounded whitespace-nowrap flex flex-col gap-0.5">
          <span>{tooltipText.split('\n')[0]}</span>
          <span>{tooltipText.split('\n')[1]}</span>
        </div>
      </div>
      <UsagePill icon={<Clock size={12} />} pct={sessionPct} tokens={sessionTokens} />
      <span className="text-text-ghost text-xs select-none">/</span>
      <UsagePill icon={<CalendarDays size={12} />} pct={weeklyPct} tokens={weeklyTokens} />
    </div>
  );
}

function UsagePill({ icon, tokens, pct }: {
  icon: React.ReactNode;
  tokens: number;
  pct: number;
}) {
  const colorClass = usageColorClass(pct);
  return (
    <div className="flex items-center gap-1">
      <span className={colorClass}>{icon}</span>
      <span className={`text-xs font-semibold tabular-nums select-none ${colorClass}`}>
        {pct > 0 ? `${Math.round(pct)}%` : formatTokens(tokens)}
      </span>
    </div>
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
