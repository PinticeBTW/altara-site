import type { Metadata } from 'next';
import { ThemeMarketplaceClient } from './theme-marketplace-client';

export const metadata: Metadata = {
  title: 'Community themes',
  description: 'Discover free and paid ALTARA themes. Review the creator, add a version to your library and choose when to apply it.',
  alternates: { canonical: '/themes' },
};

export default function ThemesPage() {
  return <ThemeMarketplaceClient />;
}
