import { useState } from 'react';
import { FormLabel } from './FormField.js';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  label?: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  /** 'inline' for horizontal, 'stack' for vertical, 'button' for button group */
  variant?: 'inline' | 'stack' | 'button';
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  variant = 'inline',
  name,
  disabled,
  className,
}: RadioGroupProps) {
  if (variant === 'button') {
    return (
      <div className={className}>
        {label && <FormLabel>{label}</FormLabel>}
        <div className="flex gap-1.5">
          {options.map(option => (
            <RadioButton
              key={option.value}
              option={option}
              selected={value === option.value}
              onClick={() => !disabled && onChange(option.value)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    );
  }

  const containerClass = variant === 'stack' ? 'flex flex-col gap-2' : 'flex gap-4';

  return (
    <div className={className}>
      {label && <FormLabel>{label}</FormLabel>}
      <div className={containerClass}>
        {options.map(option => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-[14px] text-[var(--text-muted)] cursor-pointer"
            style={{ opacity: disabled ? 0.5 : 1 }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="accent-green-500"
            />
            <span>{option.label}</span>
            {option.description && (
              <span className="text-[12px] text-[var(--text-ghost)]">({option.description})</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function RadioButton({
  option,
  selected,
  onClick,
  disabled,
}: {
  option: RadioOption;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const bgBase = selected ? '#141428' : '#080812';
  const bgHover = selected ? '#1e1e38' : '#141428';

  return (
    <button
      type="button"
      title={option.description}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        flex: 1,
        background: hovered && !disabled ? bgHover : bgBase,
        border: `1px solid ${selected ? '#3b3b60' : '#1a1a28'}`,
        color: selected || hovered ? (selected ? '#9898d0' : '#b0b0e0') : '#888',
        borderRadius: 4,
        fontSize: 14,
        padding: '8px 4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.1s, color 0.1s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {option.label}
    </button>
  );
}
