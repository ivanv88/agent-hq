import { useEffect, useState } from 'react';
import type { DiffResult } from '@lacc/shared';

interface Props {
  taskId: string;
  active: boolean;
}

export function DiffView({ taskId, active }: Props) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!active || diff) return;
    setLoading(true);
    fetch(`/tasks/${taskId}/diff`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<DiffResult>;
      })
      .then(data => {
        setDiff(data);
        if (data.files.length > 0) setSelectedFile(data.files[0].path);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [active, taskId, diff]);

  if (loading) return <div className="p-4 text-[#444] text-[14px]">Loading diff...</div>;
  if (error) return <div className="p-4 text-[#f87171] text-[14px]">Error: {error}</div>;
  if (!diff) return null;

  const current = diff.files.find(f => f.path === selectedFile);

  return (
    <div className="flex h-full">
      {/* File list */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid #13131f',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            padding: '8px',
            fontSize: 12,
            color: 'var(--text-ghost)',
            borderBottom: '1px solid #13131f',
          }}
        >
          +{diff.totalAdditions} -{diff.totalDeletions} across {diff.files.length} files
        </div>
        {diff.files.map(f => (
          <button
            key={f.path}
            onClick={() => setSelectedFile(f.path)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              fontSize: 14,
              borderBottom: '1px solid #0d0d18',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              background: selectedFile === f.path ? '#111120' : 'transparent',
              color: selectedFile === f.path ? '#d4d4e8' : '#555',
              border: 'none',
              borderBottomColor: '#0d0d18',
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              display: 'block',
            }}
            onMouseEnter={e => {
              if (selectedFile !== f.path) {
                (e.currentTarget as HTMLButtonElement).style.background = '#1e1e30';
              }
            }}
            onMouseLeave={e => {
              if (selectedFile !== f.path) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }
            }}
            title={f.path}
          >
            <span style={{ color: '#4ade80', fontSize: 12 }}>+{f.additions}</span>{' '}
            <span style={{ color: '#f87171', fontSize: 12 }}>-{f.deletions}</span>{' '}
            {f.path.split('/').pop()}
          </button>
        ))}
      </div>

      {/* Patch display */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          background: '#060610',
        }}
      >
        {current ? (
          <pre style={{ fontSize: 14, lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {renderPatch(current.patch)}
          </pre>
        ) : (
          <div style={{ color: '#555', fontSize: 14 }}>Select a file</div>
        )}
      </div>
    </div>
  );
}

function renderPatch(patch: string): React.ReactNode[] {
  return patch.split('\n').map((line, i) => {
    const isAdd = line.startsWith('+') && !line.startsWith('+++');
    const isDel = line.startsWith('-') && !line.startsWith('---');
    const isHunk = line.startsWith('@@');
    const isHeader = line.startsWith('diff') || line.startsWith('index');

    let color = '#556';
    if (isAdd) color = '#4ade80';
    else if (isDel) color = '#f87171';
    else if (isHunk) color = '#a78bfa';
    else if (isHeader) color = '#60a5fa';

    const style: React.CSSProperties = {
      color,
      padding: '0 4px',
    };

    if (isAdd) style.background = '#0d1f0d';
    else if (isDel) style.background = '#1f0d0d';

    return (
      <div key={i} style={style}>
        {line || ' '}
      </div>
    );
  });
}
