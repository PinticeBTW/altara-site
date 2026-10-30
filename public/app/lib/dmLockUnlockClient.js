const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

// The proof is held only by this renderer. It is never persisted with chat data.
export async function requestDmLockUnlock({ supabase, dmId, code, assertCurrent = () => {}, now = Date.now }) {
  assertCurrent();
  let result;
  try {
    result = await supabase.functions.invoke('unlock-dm-lock', { body: { dm_id: dmId, code } });
  } catch {
    assertCurrent();
    throw new Error('Não foi possível desbloquear a DM. Verifica a ligação e tenta novamente.');
  }
  assertCurrent();
  if (result?.error) {
    const status = Number(result.error.context?.status || result.error.status || 0);
    throw new Error(status === 403 ? 'Código incorreto ou acesso à conversa indisponível.'
      : status === 401 ? 'A sessão expirou. Inicia sessão novamente.'
        : status === 429 ? 'Demasiadas tentativas. Aguarda alguns minutos e tenta novamente.'
          : 'O desbloqueio de DMs está temporariamente indisponível. Tenta novamente.');
  }
  const data = result?.data;
  const expiresAt = Date.parse(data?.expires_at);
  if (data?.ok !== true || data.dm_id !== dmId || typeof data.unlock_token !== 'string' || typeof data.expires_at !== 'string'
      || !tokenPattern.test(data.unlock_token) || !Number.isFinite(expiresAt)
      || expiresAt <= now() || expiresAt > now() + 2 * 3600000 + 60000) {
    throw new Error('O servidor não confirmou o desbloqueio desta DM. Tenta novamente.');
  }
  return { token: data.unlock_token, expiresAt };
}
