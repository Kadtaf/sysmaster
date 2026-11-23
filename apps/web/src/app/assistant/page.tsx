import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { AssistantConversationSummary } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { AssistantChat } from './assistant-chat';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Assistant' };

export default async function AssistantPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error) redirect('/connexion?callbackUrl=/assistant');

  let conversations: AssistantConversationSummary[];
  try {
    conversations = (await apiGet<AssistantConversationSummary[]>('/assistant/conversations', session.accessToken)) ?? [];
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }

  return (
    <>
      <h1 className="text-3xl font-bold">Assistant</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Posez une question d&apos;administration système. Chaque réponse explique pourquoi, comment et quand agir, avec les
        risques, et cite les fiches de la base de connaissances sur lesquelles elle s&apos;appuie.
      </p>
      <AssistantChat conversations={conversations} />
    </>
  );
}
