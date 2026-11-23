import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export function ApiUnavailable() {
  return (
    <Card className="border-amber-400">
      <CardTitle>L&apos;API ne répond pas</CardTitle>
      <CardDescription>
        Démarrez la pile avec <code className="font-mono">docker compose up</code> ou{' '}
        <code className="font-mono">pnpm dev</code>, puis rechargez la page.
      </CardDescription>
    </Card>
  );
}
