import type { Metadata } from "next";
import VoiceDashboard from "./voice-dashboard";
import "./voice-dashboard.css";

export const metadata: Metadata = {
  title: "Analytics de voz · Administração",
  description: "Painel administrativo privado de chamadas ALTARA.",
  robots: { index: false, follow: false, nocache: true },
};

export default function VoiceAnalyticsPage() {
  return <VoiceDashboard />;
}
