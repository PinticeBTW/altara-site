import type { Metadata } from 'next';
import { ThemeMarketplaceClient } from '../../themes/theme-marketplace-client';
export const metadata: Metadata = { title: 'Theme developers', description: 'Write ALTARA themes with code. Upload, validate, preview and publish free or paid versions.' };
export default function ThemesPage() { return <ThemeMarketplaceClient developers />; }
