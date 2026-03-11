import { useState, useEffect, useRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({ value, onChange, options, placeholder, disabled, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler, true);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler, true);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="select-trigger"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#07070f',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: open ? '#3b3b5e' : '#1e1e30',
          borderRadius: 4,
          padding: '8px 12px',
          fontSize: 14,
          color: selected ? 'var(--text-bright)' : 'var(--text-muted)',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        <span>{selected?.label ?? placeholder ?? 'Select...'}</span>
        <span style={{ color: '#555', fontSize: 12, marginLeft: 8 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          className="select-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            background: '#0c0c1a',
            border: '1px solid #2a2a3e',
            borderRadius: 4,
            marginTop: 2,
            overflow: 'hidden',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {options.map(o => (
            <SelectItem
              key={o.value}
              option={o}
              selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SelectItem({
  option,
  selected,
  onClick,
}: {
  option: SelectOption;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        fontSize: 14,
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: selected ? '#111120' : hovered ? '#1e1e30' : 'transparent',
        color: selected ? '#c0c0e8' : '#888',
        borderBottom: '1px solid #13131f',
        border: 'none',
        display: 'block',
      }}
    >
      <div>{option.label}</div>
      {option.description && (
        <div style={{ fontSize: 12, color: 'var(--text-ghost)', marginTop: 2 }}>
          {option.description}
        </div>
      )}
    </button>
  );
}
