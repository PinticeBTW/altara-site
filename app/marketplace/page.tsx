import { WidgetMarketplaceClient } from '../widgets/widget-marketplace-client';
export const metadata = { title: 'Marketplace', description: 'Discover community widgets and themes. Choose free widgets or one-time purchases where available, then review and install.', alternates: { canonical: '/marketplace' } };
export default function MarketplacePage() { return <WidgetMarketplaceClient />; }
