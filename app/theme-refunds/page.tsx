import type { Metadata } from "next";
import { MarketplaceRefundPolicy } from "../components/marketplace-refund-policy";

const description = "How to request a theme withdrawal or refund, keep your receipt and follow payment and account-access status.";
export const metadata: Metadata = { title: "Theme withdrawals and refunds", description, alternates: { canonical: "/theme-refunds" }, openGraph: { title: "ALTARA theme withdrawals and refunds", description, url: "/theme-refunds" } };

export default function ThemeRefundsPage() {
  return <MarketplaceRefundPolicy />;
}
