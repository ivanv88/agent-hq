import { Button } from './Button.js';
import type { Tab } from './Tabs.js';
import { Tabs } from './Tabs.js';

interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export function ModalHeader({ title, subtitle, tabs, activeTab, onTabChange }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 style={{ color: 'var(--text-bright)', fontSize: 14, fontWeight: 600 }}>{title}</h2>
        {subtitle && (
          <p className="mt-1 text-[14px] text-[#444]">{subtitle}</p>
        )}
      </div>
      {tabs && activeTab && onTabChange && (
        <Tabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} variant="pill" />
      )}
    </div>
  );
}

interface ModalFooterProps {
  /** Label for cancel button. Set to null to hide. */
  cancelLabel?: string | null;
  /** Label for primary button */
  primaryLabel?: string;
  /** Loading state label for primary button */
  loadingLabel?: string;
  /** Success state label for primary button */
  successLabel?: string;
  onCancel?: () => void;
  onPrimary?: () => void;
  primaryType?: 'button' | 'submit';
  primaryVariant?: 'primary' | 'success' | 'danger';
  primaryDisabled?: boolean;
  loading?: boolean;
  success?: boolean;
  /** Extra buttons to render before cancel */
  extra?: React.ReactNode;
  className?: string;
}

export function ModalFooter({
  cancelLabel = 'Cancel',
  primaryLabel = 'Submit',
  loadingLabel,
  successLabel,
  onCancel,
  onPrimary,
  primaryType = 'button',
  primaryVariant = 'primary',
  primaryDisabled,
  loading,
  success,
  extra,
  className,
}: ModalFooterProps) {
  const getButtonLabel = () => {
    if (success && successLabel) return successLabel;
    if (loading && loadingLabel) return loadingLabel;
    return primaryLabel;
  };

  return (
    <div className={`flex justify-end gap-2 pt-2 ${className ?? ''}`}>
      {extra}
      {cancelLabel !== null && (
        <Button
          variant="ghost"
          onClick={onCancel}
          style={{ background: 'transparent', border: '1px solid var(--color-surface-inset)', color: 'var(--text-muted)' }}
        >
          {cancelLabel}
        </Button>
      )}
      {primaryLabel && (
        <Button
          type={primaryType}
          variant={primaryVariant}
          onClick={primaryType === 'button' ? onPrimary : undefined}
          disabled={primaryDisabled || loading}
        >
          {getButtonLabel()}
        </Button>
      )}
    </div>
  );
}
