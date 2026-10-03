import { redirect } from 'next/navigation';
export default async function WidgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, query = new URLSearchParams();
  for (const key of ['widget', 'creator']) { const value = params[key]; if (typeof value === 'string') query.set(key, value); }
  redirect('/marketplace' + (query.size ? '?' + query.toString() : ''));
}
