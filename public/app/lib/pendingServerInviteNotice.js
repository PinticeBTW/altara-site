import {
  clearPendingServerInvite, getPendingServerInviteValidationState,
  onPendingServerInviteValidationChange, removeInviteEntryFromCurrentUrl,
  retryPendingServerInviteValidation, pendingServerInviteAuthUrl,
} from "./pendingServerInvite.js";

export function mountPendingServerInviteNotice({ t, page = "login", document: doc = globalThis.document } = {}) {
  const box = doc.getElementById("authPendingInvite");
  const text = doc.getElementById("authPendingInviteText");
  const cancel = doc.getElementById("btnCancelPendingInvite");
  if (!box || !text || !cancel) return { render() {} };
  const retry = doc.createElement("button");
  retry.id = "btnRetryPendingInvite";
  retry.type = "button";
  retry.className = cancel.className;
  box.insertBefore(retry, cancel);
  const altLink = doc.getElementById("authAltLink");
  const altHref = altLink?.getAttribute("href");
  const render = () => {
    const { status } = getPendingServerInviteValidationState();
    box.hidden = status === "idle";
    if (altLink && altHref) altLink.setAttribute("href", pendingServerInviteAuthUrl(altHref));
    retry.hidden = status !== "unavailable";
    retry.textContent = t("invite.retry", "Retry");
    cancel.textContent = t("invite.cancel", "Cancel invite");
    const key = status === "saved" ? (page === "register" ? "savedRegister" : "savedLogin") : status;
    text.textContent = t(`invite.${key}`, "ALTARA could not check this invite. Check your connection and retry.");
  };
  cancel.addEventListener("click", () => {
    clearPendingServerInvite();
    removeInviteEntryFromCurrentUrl();
  });
  retry.addEventListener("click", () => {
    void retryPendingServerInviteValidation().then(() => {
      if (getPendingServerInviteValidationState().status !== "unavailable") removeInviteEntryFromCurrentUrl();
    });
  });
  onPendingServerInviteValidationChange(render);
  render();
  return { render };
}
