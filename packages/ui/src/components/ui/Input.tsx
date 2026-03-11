import { forwardRef } from 'react';

export const inputClassName = 'w-full bg-surface-base border border-border-emphasis rounded px-3 py-2.5 text-[14px] text-[var(--text-bright)] font-mono focus:outline-none focus:border-border-accent placeholder:text-text-disabled';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={className ? `${inputClassName} ${className}` : inputClassName}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const textareaClassName = `${inputClassName} resize-y`;
    return (
      <textarea
        ref={ref}
        className={className ? `${textareaClassName} ${className}` : textareaClassName}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
