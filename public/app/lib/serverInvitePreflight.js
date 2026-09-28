// Read-only status check. Never use authenticated preview fallbacks or cached previews.
export function createServerInvitePreflightValidator(client, { timeoutMs = 8000 } = {}) {
  return async (code) => {
    let timer;
    const controller = new AbortController();
    try {
      const request = client.rpc("validate_server_invite_pre_auth_v1", { p_code: code });
      const result = await Promise.race([
        typeof request.abortSignal === "function" ? request.abortSignal(controller.signal) : request,
        new Promise(resolve => { timer = setTimeout(() => {
          controller.abort();
          resolve({ error: true });
        }, timeoutMs); }),
      ]);
      if (result?.error) return { status: "unavailable" };
      const data = result?.data;
      if (data?.ok === true && data.status === "valid") return { status: "valid" };
      const terminal = ["invalid", "expired", "revoked", "exhausted", "server_unavailable"];
      return { status: data?.ok === false && terminal.includes(data.status) ? data.status : "unavailable" };
    } catch (_) {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  };
}
