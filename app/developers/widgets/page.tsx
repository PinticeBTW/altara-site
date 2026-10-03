import type { Metadata } from 'next';
import { WidgetMarketplaceClient } from '../../widgets/widget-marketplace-client';
export const metadata: Metadata = { title: 'Widget developers', description: 'Build an ALTARA widget with HTML, CSS and JavaScript. Test locally, host it and publish it.' };
export default function WidgetDevelopersPage() { return <WidgetMarketplaceClient developers />; }
