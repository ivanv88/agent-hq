import { forwardRef } from 'react';
import { Input, Textarea, type InputProps, type TextareaProps } from './Input.js';

export const labelClassName = 'text-[12px] text-[var(--text-muted)] mb-2 block uppercase tracking-[0.08em]';

interface FormLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  action?: React.ReactNode;
}

export function FormLabel({ children, htmlFor, required, action }: FormLabelProps) {
  return (
    <label htmlFor={htmlFor} className={labelClassName}>
      {children}
      {required && <span className="text-[#f87171] ml-0.5">*</span>}
      {action && <span className="ml-2">{action}</span>}
    </label>
  );
}

interface FormFieldProps extends Omit<InputProps, 'children'> {
  label: string;
  hint?: string;
  error?: string;
  labelAction?: React.ReactNode;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, hint, error, labelAction, className, ...inputProps }, ref) => {
    return (
      <div className={className}>
        <FormLabel required={inputProps.required} action={labelAction}>
          {label}
        </FormLabel>
        <Input ref={ref} {...inputProps} />
        {hint && !error && (
          <div className="text-[12px] text-[var(--text-ghost)] mt-1">{hint}</div>
        )}
        {error && (
          <div className="text-[12px] text-[#f87171] mt-1">{error}</div>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

interface FormTextareaProps extends Omit<TextareaProps, 'children'> {
  label: string;
  hint?: string;
  error?: string;
  labelAction?: React.ReactNode;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, hint, error, labelAction, className, ...textareaProps }, ref) => {
    return (
      <div className={className}>
        <FormLabel required={textareaProps.required} action={labelAction}>
          {label}
        </FormLabel>
        <Textarea ref={ref} {...textareaProps} />
        {hint && !error && (
          <div className="text-[12px] text-[var(--text-ghost)] mt-1">{hint}</div>
        )}
        {error && (
          <div className="text-[12px] text-[#f87171] mt-1">{error}</div>
        )}
      </div>
    );
  }
);

FormTextarea.displayName = 'FormTextarea';
