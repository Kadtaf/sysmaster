import { Award, BookOpenCheck, Flame, Footprints, GraduationCap, ShieldCheck, Stethoscope, Terminal, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  footprints: Footprints,
  'book-open-check': BookOpenCheck,
  stethoscope: Stethoscope,
  'graduation-cap': GraduationCap,
  flame: Flame,
  terminal: Terminal,
  'shield-check': ShieldCheck,
};

export function BadgeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Award;
  return <Icon className={className} aria-hidden />;
}
