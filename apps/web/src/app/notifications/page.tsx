import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { NotificationListDto, NotificationPreferenceDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { NotificationsView } from './notifications-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const token = await serverAccessToken();
  if (!token) redirect('/connexion?callbackUrl=/notifications');
  let list: NotificationListDto | null;
  let prefs: NotificationPreferenceDto[] | null;
  try {
    [list, prefs] = await Promise.all([
      apiGet<NotificationListDto>('/me/notifications', token),
      apiGet<NotificationPreferenceDto[]>('/me/notifications/preferences', token),
    ]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!list || !prefs) redirect('/connexion?callbackUrl=/notifications');
  return <NotificationsView list={list} preferences={prefs} />;
}
