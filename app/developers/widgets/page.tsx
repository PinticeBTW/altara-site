import type { Metadata } from 'next';
import { WidgetMarketplaceClient } from '../../widgets/widget-marketplace-client';
export const metadata: Metadata = { title: 'Widget developers', description: 'Build an ALTARA widget with HTML, CSS and JavaScript. Test a fixed release and publish free, or sell with verified Stripe setup where enabled.' };
export default function WidgetDevelopersPage() { return <WidgetMarketplaceClient developers />; }
