import type { Metadata } from "next";
import Link from "next/link";
import "./voice/voice-dashboard.css";

export const metadata: Metadata = {
  title: "Administração",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  return (
    <main className="voiceAdmin" lang="pt-PT">
      <header className="voiceAdminHeader">
        <a className="voiceAdminBrand" href="/app/index.html"><span aria-hidden="true">A</span><strong>ALTARA<small>Administração privada</small></strong></a>
        <a href="/app/index.html">Voltar à aplicação ↗</a>
      </header>
      <div className="voiceAdminContent">
        <p className="voiceEyebrow">ADMINISTRAÇÃO</p>
        <h1>Operação do ALTARA.</h1>
        <p className="voiceIntro">Os dados administrativos exigem uma sessão autenticada e autorização confirmada no servidor.</p>
        <Link className="voiceAdminEntry" href="/admin/voice">
          <span className="voiceEyebrow">VOZ · LIVEKIT</span>
          <h2>Chamadas e utilização</h2>
          <p>Atividade atual, sessões anteriores e contas associadas às ligações de voz.</p>
          <strong>Abrir painel de voz →</strong>
        </Link>
      </div>
    </main>
  );
}
