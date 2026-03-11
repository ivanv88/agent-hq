import { forwardRef } from 'react';

type ButtonVariant = 'ghost' | 'primary' | 'success' | 'danger' | 'warning' | 'link' | 'icon';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keyboard shortcut hint displayed as a badge */
  kbd?: string;
}

const variantStyles: Record<ButtonVariant, {
  base: React.CSSProperties;
  hover: React.CSSProperties;
}> = {
  ghost: {
    base: {
      background: 'var(--color-surface-overlay)',
      border: '1px solid var(--color-border-emphasis)',
      color: 'var(--color-text-default)',
    },
    hover: {
      background: 'var(--color-surface-active)',
      color: 'var(--color-text-heading)',
    },
  },
  primary: {
    base: {
      background: 'var(--color-surface-overlay)',
      border: '1px solid var(--color-border-accent)',
      color: 'var(--color-accent-primary)',
      fontWeight: 600,
    },
    hover: {
      background: 'var(--color-surface-hover)',
    },
  },
  success: {
    base: {
      background: 'var(--color-status-working-bg)',
      border: '1px solid color-mix(in srgb, var(--color-status-working) 27%, transparent)',
      color: 'var(--color-status-working)',
      fontWeight: 600,
    },
    hover: {
      background: 'color-mix(in srgb, var(--color-status-working-bg) 80%, var(--color-status-working) 20%)',
    },
  },
  danger: {
    base: {
      background: 'var(--color-status-failed-bg)',
      border: '1px solid color-mix(in srgb, var(--color-status-failed) 27%, transparent)',
      color: 'var(--color-status-failed)',
    },
    hover: {
      background: 'color-mix(in srgb, var(--color-status-failed-bg) 80%, var(--color-status-failed) 20%)',
    },
  },
  warning: {
    base: {
      background: 'var(--color-status-review-bg)',
      border: '1px solid color-mix(in srgb, var(--color-status-review) 27%, transparent)',
      color: 'var(--color-status-review)',
    },
    hover: {
      background: 'color-mix(in srgb, var(--color-status-review-bg) 80%, var(--color-status-review) 20%)',
    },
  },
  link: {
    base: {
      background: 'none',
      border: 'none',
      color: 'var(--color-text-ghost)',
      padding: 0,
    },
    hover: {
      color: 'var(--color-text-default)',
    },
  },
  icon: {
    base: {
      background: 'none',
      border: 'none',
      color: 'var(--color-text-ghost)',
      padding: '4px',
      width: 28,
      height: 28,
      justifyContent: 'center',
    },
    hover: {
      background: 'var(--color-surface-hover)',
      color: 'var(--color-text-bright)',
    },
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: '5px 10px',
    fontSize: 14,
  },
  md: {
    padding: '6px 16px',
    fontSize: 14,
  },
};

const kbdStyle: React.CSSProperties = {
  background: 'var(--color-surface-active)',
  border: '1px solid var(--color-border-accent)',
  borderRadius: 3,
  padding: '0 4px',
  fontSize: 12,
  color: 'inherit',
  opacity: 0.7,
  marginLeft: 8,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size = 'md', kbd, children, style, disabled, className, ...props }, ref) => {
    const variantStyle = variantStyles[variant];
    const sizeStyle = variant === 'link' || variant === 'icon' ? {} : sizeStyles[size];

    const baseStyle: React.CSSProperties = {
      borderRadius: 4,
      cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      transition: 'background 0.1s, color 0.1s',
      opacity: disabled ? 0.5 : 1,
      ...sizeStyle,
      ...variantStyle.base,
      ...style,
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const target = e.currentTarget;
      Object.assign(target.style, variantStyle.hover);
      props.onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const target = e.currentTarget;
      // Reset to base styles
      Object.assign(target.style, variantStyle.base);
      if (style) Object.assign(target.style, style);
      props.onMouseLeave?.(e);
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        style={baseStyle}
        className={className}
        {...props}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {kbd && <span style={kbdStyle}>{kbd}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
