import { CheckCircle2, Circle, Lock } from 'lucide-react';
import type { LessonStatus } from '@sysmaster/contracts';

const meta: Record<LessonStatus, { label: string; icon: typeof Circle; className: string }> = {
  completed: { label: 'Validée', icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  available: { label: 'Disponible', icon: Circle, className: 'text-primary' },
  locked: { label: 'Verrouillée : validez d’abord la leçon précédente', icon: Lock, className: 'text-muted-foreground' },
};

export function LessonStatusIcon({ status }: { status: LessonStatus | null }) {
  if (!status) return <Circle className="size-4 text-muted-foreground" aria-hidden />;
  const { label, icon: Icon, className } = meta[status];
  return (
    <>
      <Icon className={`size-4 shrink-0 ${className}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  );
}
