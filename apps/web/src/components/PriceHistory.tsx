import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';

interface Point {
  day: string;
  median: number;
  samples: number;
}

/** 5.3: a small line chart of the group's daily median used price (UAH). */
export function PriceHistory({ groupId }: { groupId: string }) {
  const { t } = usePrefs();
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    let alive = true;
    setPoints(null);
    api<Point[]>(`/api/groups/${groupId}/price-history?days=90`)
      .then((rows) => alive && setPoints(rows))
      .catch(() => alive && setPoints([]));
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (!points) return null;
  if (points.length < 2) return <div className="muted">{t('groups.historyEmpty')}</div>;
  const width = 240;
  const height = 48;
  const values = points.map((point) => point.median);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.median - min) / spread) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (
    <div className="muted">
      <svg width={width} height={height} role="img" aria-label={t('groups.history')}>
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div>{t('groups.historyRange', { from: first.day, to: last.day, min, max, last: last.median })}</div>
    </div>
  );
}
