import { WidgetMarketplaceClient } from '../widgets/widget-marketplace-client';
export const metadata = { title: 'Marketplace', description: 'Discover widgets from ALTARA creators. Install, rate and make your home your own.', alternates: { canonical: '/marketplace' } };
export default function MarketplacePage() { return <WidgetMarketplaceClient />; }
