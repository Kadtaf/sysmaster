import type { RiskLevel } from '@sysmaster/contracts';
import { Badge } from '@/components/ui/badge';
import { riskMeta } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const meta = riskMeta[level];
  return <Badge className={cn(meta.className, className)}>{meta.label}</Badge>;
}
