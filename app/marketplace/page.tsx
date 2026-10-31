import { WidgetMarketplaceClient } from '../widgets/widget-marketplace-client';
export const metadata = { title: 'Marketplace', description: 'Discover free widgets and themes from ALTARA creators. Make your home your own.', alternates: { canonical: '/marketplace' } };
export default function MarketplacePage() { return <WidgetMarketplaceClient />; }
