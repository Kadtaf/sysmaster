import type { Metadata } from 'next';
import { DiagnosticForm } from './diagnostic-form';

export const metadata: Metadata = { title: 'Diagnostic' };

export default function DiagnosticPage() {
  return (
    <>
      <h1 className="text-3xl font-bold">Diagnostic</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Décrivez la panne et, si vous l&apos;avez, collez un extrait de journal. Le moteur classe les causes probables et
        explique pourquoi, avant de proposer un plan d&apos;action.
      </p>
      <DiagnosticForm />
    </>
  );
}
