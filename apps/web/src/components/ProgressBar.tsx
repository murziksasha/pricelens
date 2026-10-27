import { usePrefs } from '../lib/i18n';

export interface ProgressBarProps {
  value?: number;
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const { t } = usePrefs();
  const isDeterminate = typeof max === 'number' && max > 0;
  const current = Math.max(0, value ?? 0);
  const percent = isDeterminate ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const displayLabel = label ?? (isDeterminate ? `${current} / ${max}` : t('progress.working'));

  return (
    <div className="progress">
      {displayLabel && <span className="progress-label">{displayLabel}</span>}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={isDeterminate ? current : undefined}
        aria-valuemin={isDeterminate ? 0 : undefined}
        aria-valuemax={isDeterminate ? max : undefined}
        aria-label={displayLabel}
      >
        {isDeterminate ? (
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        ) : (
          <div className="progress-indeterminate" />
        )}
      </div>
    </div>
  );
}

