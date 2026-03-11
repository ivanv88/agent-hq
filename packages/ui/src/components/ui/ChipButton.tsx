import { forwardRef } from 'react';

interface ChipButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Truncate text with max width */
  truncate?: boolean;
  maxWidth?: number;
}

/**
 * Small pill-shaped button used for filters, tabs, and toggles.
 * Handles hover states via CSS rather than JS handlers.
 */
export const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(
  ({ active, truncate, maxWidth, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={`
          chip-button
          border-none rounded px-2 py-[3px] text-sm cursor-pointer
          transition-colors duration-100
          ${active 
            ? 'bg-surface-overlay text-text-bright' 
            : 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-bright'
          }
          ${truncate ? 'truncate shrink-0' : ''}
          ${className ?? ''}
        `}
        style={maxWidth ? { maxWidth } : undefined}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ChipButton.displayName = 'ChipButton';
