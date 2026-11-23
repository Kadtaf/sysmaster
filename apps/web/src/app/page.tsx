import { BookOpen, FlaskConical, GraduationCap, MessageSquareText, Stethoscope } from 'lucide-react';
import { Hero } from '@/components/home/hero';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

const pillars = [
  { icon: BookOpen, title: 'Académie', text: 'Parcours progressifs de technicien à ingénieur DevOps.', phase: 'Phase 2' },
  { icon: Stethoscope, title: 'Diagnostic', text: 'Causes probables, score de confiance et plan d’action expliqué.', phase: 'Disponible (v1)' },
  { icon: FlaskConical, title: 'Laboratoires', text: 'Pannes réelles reproduites dans des environnements isolés.', phase: 'Phase 4' },
  { icon: MessageSquareText, title: 'Assistant IA', text: '12 agents spécialisés, réponses sourcées.', phase: 'Phase 3' },
  { icon: GraduationCap, title: 'Certifications', text: '10 certifications vérifiables par QR code.', phase: 'Phase 5' },
];

const questions = ['Pourquoi ?', 'Comment ?', 'Quand ?', 'Dans quel contexte ?', 'Quels risques ?', 'Quelles alternatives ?'];

export default function HomePage() {
  return (
    <>
      <Hero />
      <section aria-labelledby="piliers" className="py-8">
        <h2 id="piliers" className="text-2xl font-semibold">Cinq outils, un seul objectif : l&apos;autonomie</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map(({ icon: Icon, title, text, phase }) => (
            <Card key={title}>
              <Icon className="size-6 text-primary" aria-hidden />
              <CardTitle className="mt-3">{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
              <p className="mt-3 text-xs font-medium text-muted-foreground">{phase}</p>
            </Card>
          ))}
        </div>
      </section>
      <section aria-labelledby="philosophie" className="py-8">
        <h2 id="philosophie" className="text-2xl font-semibold">Comprendre avant d&apos;exécuter</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Aucun copier-coller aveugle. Avant de voir une commande, vous voyez les six réponses qui permettent de décider
          si elle est la bonne.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {questions.map((q) => (
            <li key={q} className="rounded-full border px-4 py-1.5 text-sm">{q}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
