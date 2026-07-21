/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo } from 'react';

export function BlobImage({
  blob,
  alt,
  className
}: {
  blob: Blob;
  alt: string;
  className?: string;
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={alt} className={className} />;
}

export function Rating({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="rating" aria-label={`5段階中${value}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={star <= value ? 'star active' : 'star'}
          onClick={() => onChange?.(star)}
          disabled={!onChange}
          aria-label={`${star}点`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function Spinner({ label = '処理中' }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" /> {label}
    </span>
  );
}

export function Toast({
  message,
  kind = 'success',
  onClose
}: {
  message: string;
  kind?: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className={`toast ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="閉じる">
        ×
      </button>
    </div>
  );
}

export function NavIcon({ name }: { name: 'home' | 'search' | 'add' | 'backup' | 'settings' }) {
  const paths: Record<typeof name, React.ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-7h6v7" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    add: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <path d="M12 7v10M7 12h10" />
      </>
    ),
    backup: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 20h14" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    )
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function formatDate(value: string): string {
  if (!value) return '未記録';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

export const TYPE_LABEL = { recipe: 'レシピ', place: '店舗', product: '商品' } as const;
export const STATUS_LABEL = { saved: '未実施', planned: '予定', completed: '実施済み' } as const;
