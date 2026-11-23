import { Award, BookOpenCheck, Flame, Footprints, GraduationCap, Stethoscope, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  footprints: Footprints,
  'book-open-check': BookOpenCheck,
  stethoscope: Stethoscope,
  'graduation-cap': GraduationCap,
  flame: Flame,
};

export function BadgeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Award;
  return <Icon className={className} aria-hidden />;
}
