import { Badge, type BadgeTone } from '@presspass/ui';
import type { CardStatus } from '@presspass/shared';

const STATUS_LABELS: Record<CardStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Дійсне', tone: 'success' },
  BLOCKED: { label: 'Заблоковане', tone: 'danger' },
  EXPIRED: { label: 'Строк дії минув', tone: 'warning' },
};

export function StatusBadge({ status }: { status: CardStatus }) {
  const { label, tone } = STATUS_LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
