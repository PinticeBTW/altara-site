"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";
import type { VoiceParticipant, VoiceSession } from "../../lib/voice-analytics-model";

type Auth = { userId: string; token: string };
type Resource<T> = { data: T | null; loading: boolean; error: string | null };
type Listing = { sessions: VoiceSession[]; updatedAt: string; partial?: boolean; warning?: string; page?: number; hasMore?: boolean };
type Detail = { session: VoiceSession; updatedAt: string };
type RequestKind = "live" | "history" | "detail";
const empty = <T,>(): Resource<T> => ({ data: null, loading: false, error: null });
const number = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
const statusLabels = { active: "Ativa", ended: "Terminada", unknown: "Por confirmar" };
const participantLabels: Record<string, string> = { active: "Ligado", joined: "A estabelecer ligação", joining: "A entrar", disconnected: "Desligado", unknown: "Por confirmar" };
const kindLabels = { user: "Conta ALTARA", bot: "Bot", companion: "Ligação auxiliar", unknown: "Identidade não reconhecida" };
const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => utcDay(new Date(Date.now() - days * 86400000));
function time(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? `${dateFormat.format(new Date(value))} UTC` : "—"; }
function duration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.floor(value));
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
}
function sessionName(session: VoiceSession) {
  if (session.scope === "private") return "Chamada privada";
  if (session.scope === "group") return "Chamada de grupo";
  return session.serverName || (session.scope === "server" ? "Servidor não identificado" : "Sala não identificada");
}
function roomDuration(session: VoiceSession, updatedAt?: string) {
  if (!session.startedAt) return null;
  const end = session.endedAt || (session.status === "active" ? updatedAt : null);
  return end ? Math.max(0, (Date.parse(end) - Date.parse(session.startedAt)) / 1000) : null;
}

function Profile({ participant }: { participant: VoiceParticipant }) {
  const [failed, setFailed] = useState(false);
  const name = participant.username || participant.displayName || kindLabels[participant.kind];
  return <div className="voiceProfile">
    <span className="voiceAvatar" aria-hidden="true">
      {participant.avatarUrl && !failed
        // URLs are restricted to the ALTARA asset origin by the server; avoid an image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={participant.avatarUrl} alt="" width="36" height="36" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : name.slice(0, 1).toUpperCase()}
    </span>
    <span><strong>{name}</strong><small>{kindLabels[participant.kind]}</small></span>
  </div>;
}

function SessionDetail({ session, updatedAt, headingRef }: { session: VoiceSession; updatedAt?: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return <section className="voicePanel voiceDetail" aria-labelledby="voice-detail-title">
    <div className="voicePanelHeading"><div><p className="voiceEyebrow">DETALHE DA SESSÃO</p><h2 id="voice-detail-title" tabIndex={-1} ref={headingRef}>{sessionName(session)}</h2></div><span className={`voiceBadge voiceBadge--${session.status}`}>{statusLabels[session.status]}</span></div>
    <dl className="voiceDetailMeta">
      <div><dt>Canal</dt><dd>{session.channelName || (session.scope === "server" ? "Não identificado" : "Privado")}</dd></div>
      <div><dt>Início</dt><dd>{time(session.startedAt)}</dd></div>
      <div><dt>Fim</dt><dd>{session.endedAt ? time(session.endedAt) : session.status === "active" ? "Em curso" : "Não confirmado"}</dd></div>
      <div><dt>Duração da sala</dt><dd>{duration(roomDuration(session, updatedAt))}</dd></div>
      <div><dt>Contas únicas reconhecidas</dt><dd>{session.uniqueUsers ?? "—"}</dd></div>
      <div><dt>Tempo de ligação de contas</dt><dd>{duration(session.connectedSeconds)}</dd></div>
      <div><dt>Minutos faturáveis LiveKit</dt><dd>{session.billableMinutes === null ? "Indisponíveis" : number.format(session.billableMinutes)}</dd></div>
    </dl>
    <details className="voiceIdentifiers"><summary>Identificadores da sessão</summary><p>Sessão: <code>{session.id}</code></p><p>Sala: <code>{session.roomName}</code></p>{session.serverId && <p>Servidor: <code>{session.serverId}</code></p>}{session.channelId && <p>Canal: <code>{session.channelId}</code></p>}</details>
    <div className="voiceTableWrap"><table className="voiceTable"><caption>Participantes e ligações desta sessão</caption><thead><tr><th scope="col">Participante</th><th scope="col">Estado</th><th scope="col">Ligação</th><th scope="col">Tempo ligado</th></tr></thead><tbody>
      {session.participants.map((participant, index) => <tr key={`${participant.identity}:${index}`}>
        <td><Profile participant={participant} /><details className="voiceIdentifiers"><summary>Ver identidade</summary><code>{participant.identity}</code>{participant.userId && <p>Conta: <code>{participant.userId}</code></p>}</details></td>
        <td>{participantLabels[participant.state] || "Por confirmar"}</td>
        <td><span>{time(participant.joinedAt)}</span><small className="voiceCellNote">{participant.leftAt ? `Até ${time(participant.leftAt)}` : "Fim não reportado"}</small></td>
        <td>{duration(participant.connectedSeconds)}<small className="voiceCellNote">{participant.connectionCount} {participant.connectionCount === 1 ? "ligação" : "ligações"}</small></td>
      </tr>)}
    </tbody></table></div>
    {!session.participants.length && <p className="voiceEmpty">A origem não devolveu participantes para esta sessão.</p>}
    <p className="voiceFootnote">As reconexões e ligações auxiliares podem criar várias identidades para a mesma conta. Os totais de contas excluem bots e ligações auxiliares; os minutos faturáveis seguem os critérios da LiveKit.</p>
  </section>;
}

export default function VoiceDashboard() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const authRef = useRef<Auth | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [tab, setTab] = useState<"live" | "history">("live");
  const [automatic, setAutomatic] = useState(true);
  const [live, setLive] = useState<Resource<Listing>>(empty);
  const [history, setHistory] = useState<Resource<Listing>>(empty);
  const [detail, setDetail] = useState<Resource<Detail>>(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dates, setDates] = useState({ start: daysAgo(6), end: daysAgo(0) });
  const [query, setQuery] = useState({ start: daysAgo(6), end: daysAgo(0), page: 0 });
  const [dateError, setDateError] = useState<string | null>(null);
  const controllers = useRef(new Map<RequestKind, AbortController>());
  const epoch = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);

  const clearData = useCallback(() => {
    epoch.current += 1;
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    setLive(empty()); setHistory(empty()); setDetail(empty()); setSelectedId(null);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const activeControllers = controllers.current;
    let mounted = true;
    let authEventSeen = false;
    const receive = (session: Session | null) => {
      if (!mounted) return;
      const next = session ? { userId: session.user.id, token: session.access_token } : null;
      if (authRef.current?.userId !== next?.userId || !next) { clearData(); setDenied(null); }
      else if (authRef.current?.token !== next.token) {
        // An old token's late 401 must not reject a freshly renewed session.
        epoch.current += 1;
        for (const controller of activeControllers.values()) controller.abort();
        activeControllers.clear();
        setLive((old) => ({ ...old, loading: false }));
        setHistory((old) => ({ ...old, loading: false }));
        setDetail((old) => ({ ...old, loading: false, error: old.loading && !old.data ? "A sessão foi renovada durante esta consulta. Tenta novamente." : old.error }));
        setDenied(null);
      }
      authRef.current = next;
      setAuth((old) => old?.userId === next?.userId && old?.token === next?.token ? old : next); setCheckingAuth(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { authEventSeen = true; receive(session); });
    void supabase.auth.getSession().then(({ data, error }) => { if (!authEventSeen) receive(error ? null : data.session); }).catch(() => { if (!authEventSeen) receive(null); });
    return () => { mounted = false; subscription.unsubscribe(); epoch.current += 1; for (const controller of activeControllers.values()) controller.abort(); activeControllers.clear(); };
  }, [clearData]);

  const request = useCallback(async (kind: RequestKind, params: URLSearchParams) => {
    const currentAuth = authRef.current;
    if (!currentAuth) return;
    // Polls never overlap; explicit filter/detail requests cancel their predecessor.
    if (kind === "live" && controllers.current.has(kind)) return;
    controllers.current.get(kind)?.abort();
    const controller = new AbortController();
    controllers.current.set(kind, controller);
    const requestEpoch = epoch.current;
    if (kind === "detail") setDetail((old) => ({ ...old, loading: true, error: null }));
    else if (kind === "live") setLive((old) => ({ ...old, loading: true, error: null }));
    else setHistory((old) => ({ ...old, loading: true, error: null }));
    try {
      const response = await fetch(`/api/admin/voice?${params}`, { headers: { Authorization: `Bearer ${currentAuth.token}` }, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
      if (requestEpoch !== epoch.current || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        clearData();
        setDenied(response.status === 401 ? "A sessão expirou ou deixou de ser válida. Entra novamente no ALTARA." : "Esta conta não tem autorização para consultar o painel administrativo.");
        return;
      }
      const payload = await response.json();
      if (requestEpoch !== epoch.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message.slice(0, 500) : "Não foi possível consultar os dados. Tenta novamente.");
      if (kind === "detail") {
        if (!payload.session) throw new Error("A origem devolveu um detalhe de sessão inválido.");
        setDetail({ data: payload as Detail, loading: false, error: null });
      } else {
        if (!Array.isArray(payload.sessions)) throw new Error("A origem devolveu uma lista de sessões inválida.");
        const result = { data: payload as Listing, loading: false, error: null };
        if (kind === "live") setLive(result); else setHistory(result);
      }
    } catch (error) {
      if (requestEpoch === epoch.current && !controller.signal.aborted) {
        const message = error instanceof Error && error.message ? error.message : "Não foi possível contactar o painel. Tenta novamente.";
        if (kind === "detail") setDetail({ data: null, loading: false, error: message });
        else if (kind === "live") setLive((old) => ({ ...old, loading: false, error: message }));
        else setHistory((old) => ({ ...old, loading: false, error: message }));
      }
    } finally {
      if (controllers.current.get(kind) === controller) controllers.current.delete(kind);
    }
  }, [clearData]);

  const loadLive = useCallback(() => request("live", new URLSearchParams({ view: "live" })), [request]);
  const loadHistory = useCallback(() => request("history", new URLSearchParams({ view: "history", start: query.start, end: query.end, page: String(query.page) })), [request, query]);

  // These effects start external I/O; loading is part of the request lifecycle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (auth && !denied) void loadLive(); }, [auth, denied, loadLive]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (auth && !denied && tab === "history") void loadHistory(); }, [auth, denied, tab, loadHistory]);
  useEffect(() => {
    if (!auth || denied || !automatic || tab !== "live") return;
    const poll = () => { if (document.visibilityState === "visible") void loadLive(); };
    const timer = window.setInterval(poll, 20000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [auth, denied, automatic, tab, loadLive]);
  useEffect(() => {
    if (detail.data && selectedId) detailHeading.current?.focus({ preventScroll: true });
  }, [detail.data, selectedId]);

  const resource = tab === "live" ? live : history;
  const sessions = useMemo(() => resource.data?.sessions || [], [resource.data]);
  const liveSelected = tab === "live" ? sessions.find((session) => session.id === selectedId) : null;
  const shownDetail = tab === "live" ? liveSelected : detail.data?.session;
  const activeUsers = new Set((live.data?.sessions || []).flatMap((session) => session.participants.filter((participant) => participant.kind === "user" && participant.userId && participant.state === "active").map((participant) => participant.userId)));
  const connectedSeconds = sessions.every((session) => session.connectedSeconds !== null && (tab !== "live" || session.uniqueUsers !== null)) ? sessions.reduce((total, session) => total + (session.connectedSeconds || 0), 0) : null;
  const billableMinutes = sessions.every((session) => session.billableMinutes !== null) ? sessions.reduce((total, session) => total + (session.billableMinutes || 0), 0) : null;
  const graphUsesMinutes = tab === "history" && sessions.length > 0 && sessions.every((session) => session.connectedSeconds !== null);
  const graph = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const session of sessions) { if (session.startedAt) { const day = session.startedAt.slice(0, 10); grouped.set(day, (grouped.get(day) || 0) + (graphUsesMinutes ? (session.connectedSeconds || 0) / 60 : 1)); } }
    return [...grouped].sort(([left], [right]) => left.localeCompare(right));
  }, [sessions, graphUsesMinutes]);
  const graphMax = Math.max(1, ...graph.map(([, count]) => count));

  function changeTab(next: "live" | "history") {
    controllers.current.get("detail")?.abort(); controllers.current.delete("detail");
    setDetail(empty()); setSelectedId(null); setTab(next);
  }
  function selectSession(session: VoiceSession) {
    if (selectedId === session.id) { controllers.current.get("detail")?.abort(); controllers.current.delete("detail"); setSelectedId(null); setDetail(empty()); return; }
    setSelectedId(session.id);
    setDetail(empty());
    if (tab === "history" && (session.uniqueUsers !== null || session.participants.length > 0)) setDetail({ data: { session, updatedAt: history.data?.updatedAt || new Date().toISOString() }, loading: false, error: null });
    else if (tab === "history") void request("detail", new URLSearchParams({ view: "session", id: session.id }));
    else window.requestAnimationFrame(() => detailHeading.current?.focus({ preventScroll: true }));
  }
  function applyDates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dates.start || !dates.end || dates.start < daysAgo(6) || dates.end > daysAgo(0) || dates.start > dates.end) { setDateError("Escolhe um intervalo válido dentro dos últimos 7 dias, em UTC."); return; }
    setDateError(null); setHistory(empty()); setDetail(empty()); setSelectedId(null);
    controllers.current.get("detail")?.abort(); controllers.current.delete("detail");
    setQuery({ ...dates, page: 0 });
  }
  function changePage(page: number) { setHistory(empty()); setDetail(empty()); setSelectedId(null); controllers.current.get("detail")?.abort(); controllers.current.delete("detail"); setQuery((old) => ({ ...old, page })); }

  return <main className="voiceAdmin" lang="pt-PT">
    <header className="voiceAdminHeader"><a className="voiceAdminBrand" href="/admin"><span aria-hidden="true">A</span><strong>ALTARA<small>Administração privada</small></strong></a><nav aria-label="Administração"><a href="/admin">Administração</a><a href="/app/index.html">Aplicação ↗</a></nav></header>
    <div className="voiceAdminContent">
      <div className="voiceTitleRow"><div><p className="voiceEyebrow">OPERAÇÃO · VOZ</p><h1>Quem está em chamada.</h1><p className="voiceIntro">Atividade e utilização das ligações de voz do ALTARA.</p></div><span className="voicePrivate"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M6 8V6a4 4 0 0 1 8 0v2M5 8h10v9H5z" /></svg>Acesso restrito</span></div>
      {checkingAuth ? <div className="voicePanel voiceGate" role="status">A verificar a tua sessão…</div> : !auth ? <div className="voicePanel voiceGate"><h2>Entra com a tua conta de administrador</h2><p>É usada a sessão do ALTARA neste navegador. A autorização é verificada no servidor em cada consulta.</p><a className="voiceButton voiceButton--primary" href="/login.html">Entrar no ALTARA</a></div> : denied ? <div className="voicePanel voiceGate" role="alert"><h2>Acesso indisponível</h2><p>{denied}</p><div className="voiceActions"><a className="voiceButton" href="/login.html">Abrir início de sessão</a><button className="voiceButton" onClick={() => { clearData(); setDenied(null); }}>Verificar acesso novamente</button></div></div> : <>
        <div className="voiceToolbar">
          <div className="voiceTabs" role="group" aria-label="Origem dos dados">
            <button type="button" aria-pressed={tab === "live"} onClick={() => changeTab("live")}><span className="voiceLiveDot" />Agora</button>
            <button type="button" aria-pressed={tab === "history"} onClick={() => changeTab("history")}>Histórico</button>
          </div>
          <div className="voiceActions">
            {tab === "live" && <button type="button" className="voiceButton voiceButton--quiet" aria-pressed={automatic} onClick={() => setAutomatic((old) => !old)}>{automatic ? "Atualização automática · 20 s" : "Atualização automática em pausa"}</button>}
            {tab === "history" && <button type="button" className="voiceButton" disabled={history.loading || !history.data?.sessions.length} onClick={() => void request("history", new URLSearchParams({ view: "usage", start: query.start, end: query.end, page: String(query.page) }))}>Calcular utilização desta página</button>}
            <button type="button" className="voiceButton" disabled={resource.loading} onClick={() => void (tab === "live" ? loadLive() : loadHistory())}>{resource.loading ? "A atualizar…" : "Atualizar"}</button>
          </div>
        </div>
        {tab === "history" && <form className="voiceDateForm" onSubmit={applyDates}><label>De <input type="date" required min={daysAgo(6)} max={daysAgo(0)} value={dates.start} onChange={(event) => setDates((old) => ({ ...old, start: event.target.value }))} /></label><label>Até <input type="date" required min={dates.start || daysAgo(6)} max={daysAgo(0)} value={dates.end} onChange={(event) => setDates((old) => ({ ...old, end: event.target.value }))} /></label><button type="submit" className="voiceButton" disabled={history.loading}>Consultar</button><p>Datas em UTC · Últimos 7 dias</p>{dateError && <p className="voiceError" role="alert">{dateError}</p>}</form>}
        <div className="voiceSourceNote"><span>{tab === "live" ? "Salas e participantes consultados diretamente na LiveKit." : "Histórico da LiveKit Cloud · Requer Scale ou superior."}</span><span>{resource.data ? `Última consulta: ${time(resource.data.updatedAt)}` : "A aguardar consulta"}</span></div>
        {resource.error && <p className="voiceNotice voiceNotice--error" role="alert">{resource.error}{resource.data && " Os dados abaixo são da última consulta bem-sucedida e podem estar desatualizados."}</p>}
        {(resource.data?.partial || resource.data?.warning) && <p className="voiceNotice" role="status">{resource.data.warning || "A consulta é parcial. Algumas salas ou participantes não puderam ser confirmados."}</p>}
        {tab === "history" && <p className="voiceFootnote">Os totais e o gráfico referem-se apenas à página apresentada. Abre uma sessão para ver as contas, os tempos de ligação e os minutos faturáveis. O histórico pode chegar com atraso.</p>}
        <div className="voiceMetrics" aria-label={tab === "live" ? "Indicadores atuais" : "Indicadores da página"}>
          <div><span>{tab === "live" ? "Salas atuais" : "Sessões nesta página"}</span><strong>{resource.data ? number.format(sessions.length) : "—"}</strong><small>{tab === "live" ? "Inclui salas ainda vazias" : `Página ${query.page + 1}`}</small></div>
          <div><span>{tab === "live" ? "Contas ligadas agora" : "Participantes reportados"}</span><strong>{resource.data ? `${tab === "live" && resource.data.partial ? "≥ " : ""}${number.format(tab === "live" ? activeUsers.size : sessions.reduce((total, session) => total + session.participantCount, 0))}` : "—"}</strong><small>{tab === "live" ? "UUIDs únicos observados em estado ativo" : "Soma por sessão · pode repetir contas"}</small></div>
          <div><span>Minutos de ligação de contas</span><strong>{resource.data && connectedSeconds !== null ? number.format(connectedSeconds / 60) : "—"}</strong><small>{tab === "live" ? "Ligações presentes na última consulta" : connectedSeconds !== null ? "Total desta página · contas reconhecidas" : "Usa «Calcular utilização desta página»"}</small></div>
          <div><span>Minutos faturáveis LiveKit</span><strong>{resource.data && billableMinutes !== null ? number.format(billableMinutes) : "—"}</strong><small>Podem incluir ligações técnicas</small></div>
        </div>
        {tab === "history" && graph.length > 0 && <section className="voicePanel voiceChart" aria-labelledby="voice-chart-title">
          <div className="voicePanelHeading"><div><p className="voiceEyebrow">UTILIZAÇÃO · PÁGINA ATUAL</p><h2 id="voice-chart-title">{graphUsesMinutes ? "Minutos de ligação por dia de início" : "Sessões iniciadas por dia"}</h2></div></div>
          <div className="voiceChartBars" role="img" aria-label={graph.map(([day, value]) => `${day}: ${number.format(value)} ${graphUsesMinutes ? "minutos" : "sessões"}`).join("; ")}>
            {graph.map(([day, value]) => <div className="voiceChartColumn" key={day}><span>{number.format(value)}</span><div className="voiceChartTrack"><i style={{ height: `${Math.max(3, value / graphMax * 100)}%` }} /></div><small>{day.slice(8)}/{day.slice(5, 7)}</small></div>)}
          </div>
          {graphUsesMinutes && <p className="voiceFootnote voiceChartNote">Cada sessão é atribuída ao dia em que começou, incluindo o seu tempo após a meia-noite.</p>}
        </section>}
        <section className="voicePanel" aria-labelledby="voice-sessions-title" aria-busy={resource.loading}><div className="voicePanelHeading"><div><p className="voiceEyebrow">{tab === "live" ? "ESTADO ATUAL" : "REGISTO DE SESSÕES"}</p><h2 id="voice-sessions-title">{tab === "live" ? "Salas de voz" : "Sessões anteriores"}</h2></div><span className="voiceCount">{resource.data ? sessions.length : "—"}</span></div>
          {!resource.data ? <p className="voiceEmpty">{resource.loading ? "A consultar as sessões…" : resource.error ? "Os dados desta origem estão indisponíveis." : "A aguardar os dados da LiveKit."}</p> : !sessions.length ? <p className="voiceEmpty">{tab === "live" ? "Não foram encontradas salas ativas nesta consulta." : "Não foram encontradas sessões neste intervalo e página."}</p> : <div className="voiceTableWrap"><table className="voiceTable"><caption className="voiceSrOnly">{tab === "live" ? "Salas e participantes atuais" : "Histórico de sessões, página atual"}</caption><thead><tr><th scope="col">Servidor / canal</th><th scope="col">Estado</th><th scope="col">Início</th><th scope="col">Participantes</th><th scope="col">Duração</th><th scope="col"><span className="voiceSrOnly">Detalhes</span></th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id} className={selectedId === session.id ? "voiceRow--selected" : undefined}><td><strong>{sessionName(session)}</strong><small className="voiceCellNote">{session.channelName || (session.scope === "server" ? "Canal não identificado" : session.scope === "private" || session.scope === "group" ? "Contexto privado" : "Contexto desconhecido")}</small></td><td><span className={`voiceBadge voiceBadge--${session.status}`}>{statusLabels[session.status]}</span></td><td>{time(session.startedAt)}</td><td><strong>{session.uniqueUsers === null ? "—" : session.uniqueUsers}</strong><small className="voiceCellNote">{session.uniqueUsers === null ? "Contas no detalhe" : "Contas únicas"} · {session.participantCount} identidades</small></td><td>{duration(roomDuration(session, resource.data?.updatedAt))}</td><td><button className="voiceButton voiceButton--quiet" aria-expanded={selectedId === session.id} aria-controls="voice-session-detail" onClick={() => selectSession(session)}>{selectedId === session.id ? "Fechar" : "Ver sessão"}</button></td></tr>)}</tbody></table></div>}
          {tab === "history" && history.data && <div className="voicePagination"><button className="voiceButton" disabled={query.page === 0 || history.loading} onClick={() => changePage(query.page - 1)}>← Anterior</button><span>Página {query.page + 1}</span><button className="voiceButton" disabled={!history.data.hasMore || history.loading} onClick={() => changePage(query.page + 1)}>Seguinte →</button></div>}
        </section>
        {selectedId && <div id="voice-session-detail" aria-live="polite">{tab === "history" && detail.loading && <p className="voiceNotice" role="status">A consultar participantes e tempos de ligação…</p>}{detail.error && <div className="voiceNotice voiceNotice--error" role="alert"><p>{detail.error}</p><button className="voiceButton" onClick={() => void request("detail", new URLSearchParams({ view: "session", id: selectedId }))}>Tentar novamente</button></div>}{shownDetail && <SessionDetail session={shownDetail} updatedAt={tab === "live" ? live.data?.updatedAt : detail.data?.updatedAt} headingRef={detailHeading} />}{tab === "live" && !liveSelected && <p className="voiceNotice">Esta sala já não está presente na consulta atual. Consulta o histórico quando estiver disponível.</p>}</div>}
      </>}
      <aside className="voicePrivacy"><h2>O que estes dados significam</h2><p>São metadados operacionais de ligações: contas, salas, estados e duração. Não consulta áudio nem mensagens. Não apresenta nem guarda IPs, localização ou dados do dispositivo. Uma conta ligada não prova que alguém esteja a falar; contas diferentes também não provam pessoas diferentes.</p><p>A atividade atual é uma fotografia da última consulta. O histórico depende da disponibilidade e retenção da LiveKit Cloud, não constitui um arquivo permanente e pode divergir do estado atual. Nomes e avatares refletem o perfil atual.</p></aside>
    </div>
  </main>;
}
