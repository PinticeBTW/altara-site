import type { Metadata } from "next";
import { MarketplaceRefundPolicy } from "../components/marketplace-refund-policy";


const description = "How to request a widget withdrawal or refund, keep your receipt, report a problem, and ask ALTARA to review a decision.";

export const metadata: Metadata = {
  title: "Widget withdrawals and refunds",
  description,
  alternates: { canonical: "/widget-refunds" },
  openGraph: { title: "ALTARA widget withdrawals and refunds", description, url: "/widget-refunds" },
};

export default function WidgetRefundsPage() {
  return <MarketplaceRefundPolicy />;
}
