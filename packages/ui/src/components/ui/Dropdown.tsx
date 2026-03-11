import { useState, useEffect, useRef, forwardRef } from 'react';
import { Input, type InputProps } from './Input.js';
import { FormLabel } from './FormField.js';

export interface DropdownItem {
  id: string;
  label: string;
  value: string;
}

interface DropdownProps extends Omit<InputProps, 'onSelect'> {
  label?: string;
  items: DropdownItem[];
  onSelect: (item: DropdownItem) => void;
  /** Show dropdown on focus when input is empty */
  showOnFocus?: boolean;
  /** Max height of dropdown menu */
  maxHeight?: number;
  /** Render when no items */
  emptyMessage?: string;
}

export const Dropdown = forwardRef<HTMLInputElement, DropdownProps>(
  (
    {
      label,
      items,
      onSelect,
      showOnFocus = true,
      maxHeight = 160,
      emptyMessage,
      onFocus,
      onBlur,
      onKeyDown,
      className,
      ...inputProps
    },
    ref
  ) => {
    const [open, setOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) {
        setFocusedIndex(-1);
      }
    }, [open]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (showOnFocus && items.length > 0) {
        setOpen(true);
      }
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Delay to allow click on dropdown item
      setTimeout(() => setOpen(false), 150);
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open && e.key === 'ArrowDown' && items.length > 0) {
        setOpen(true);
        e.preventDefault();
        return;
      }

      if (open) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setFocusedIndex(i => Math.min(i + 1, items.length - 1));
            break;
          case 'ArrowUp':
            e.preventDefault();
            setFocusedIndex(i => Math.max(i - 1, 0));
            break;
          case 'Enter':
            if (focusedIndex >= 0 && items[focusedIndex]) {
              e.preventDefault();
              onSelect(items[focusedIndex]);
              setOpen(false);
            }
            break;
          case 'Escape':
            e.stopPropagation();
            setOpen(false);
            break;
        }
      }

      onKeyDown?.(e);
    };

    const showDropdown = open && (items.length > 0 || emptyMessage);

    return (
      <div ref={containerRef} className={`relative ${className ?? ''}`}>
        {label && <FormLabel>{label}</FormLabel>}
        <Input
          ref={ref}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          {...inputProps}
        />
        {showDropdown && (
          <div
            className="dropdown-menu"
            style={{
              position: 'absolute',
              zIndex: 10,
              left: 0,
              right: 0,
              marginTop: 2,
              background: '#0c0c1a',
              border: '1px solid #2a2a3e',
              borderRadius: 4,
              maxHeight,
              overflowY: 'auto',
            }}
          >
            {items.length === 0 && emptyMessage ? (
              <div className="text-[12px] text-[var(--text-ghost)] p-3">{emptyMessage}</div>
            ) : (
              items.map((item, index) => (
                <DropdownMenuItem
                  key={item.id}
                  item={item}
                  focused={index === focusedIndex}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  }
);

Dropdown.displayName = 'Dropdown';

function DropdownMenuItem({
  item,
  focused,
  onSelect,
}: {
  item: DropdownItem;
  focused: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onMouseDown={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full text-left truncate"
      style={{
        padding: '8px 12px',
        fontSize: 14,
        color: 'var(--text-muted)',
        borderBottom: '1px solid #13131f',
        background: focused || hovered ? '#111120' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {item.label}
    </button>
  );
}
