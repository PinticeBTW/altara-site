import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const source = fs.readFileSync(new URL("../app/developers/components/developer-portal-client.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("portal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["asRecord", "errorMessage", "firstRow", "parseCommandDeliveryState", "loadCommandDeliveryMode", "loadEndpoint", "handleSaveEndpoint", "handleTestEndpoint", "handleSaveCommandDeliveryMode", "runAction", "WebhooksPage"];
const secretNames = ["handleRotateSigningSecret", "handleCopySecret", "StatusNotice"];
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...names, ...secretNames].includes(node.name.text)) functions.set(node.name.text, node.getText(parsed));
  ts.forEachChild(node, visit);
}
visit(parsed);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clone = value => JSON.parse(JSON.stringify(value));
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture({ secrets = false } = {}) {
  for (const name of secrets ? [...names, ...secretNames] : names) assert.ok(functions.has(name), `${name} must be defined in the actual portal source`);
  const app = { app_id: id(10), bot_id: id(20) };
  const owner = id(1), scope = `${owner}:${app.app_id}:${app.bot_id}`;
  const calls = [], notices = [];
  const context = {
    user: { id: owner }, selectedBot: app, identityRef: { current: owner }, selectionRef: { current: { appId: app.app_id, botId: app.bot_id } },
    detailsRequestRef: { current: 1 }, commandDeliveryRequestRef: { current: 0 }, commandDeliveryWriteVersionRef: { current: 0 },
    actionLockRef: { current: false }, commandDeliveryState: null, commandDeliveryDraft: null, secretNotice: null, busyAction: "", React, useState: React.useState,
    notifyBotMetadataChanged(...args) { calls.push(["notify", ...args]); },
    PageHeader: ({ title, description }) => React.createElement("header", null, React.createElement("h1", null, title), React.createElement("p", null, description)),
    setCommandDeliveryState(value) { context.commandDeliveryState = typeof value === "function" ? value(context.commandDeliveryState) : value; },
    setCommandDeliveryDraft(value) { context.commandDeliveryDraft = typeof value === "function" ? value(context.commandDeliveryDraft) : value; },
    setBusyAction(value) { context.busyAction = value; },
    setEndpoint(value) { context.endpoint = value; }, setDetailsError() {},
    setNotice(value) { if (value) notices.push(clone(value)); },
    setSecretNotice(value) { context.secretNotice = typeof value === "function" ? value(context.secretNotice) : value; },
    navigator: { clipboard: { async writeText(value) { calls.push(["clipboard", value]); } } },
    supabase: { functions: { async invoke(name, options) { calls.push(["edge", name, clone(options)]); return { data: { ok: true }, error: null }; } } },
    async rpc(name, args) { calls.push([name, clone(args)]); return context.reply(name, args); },
    reply: () => ({ mode: "bot_token", https_ready: false }),
  };
  const compiled = ts.transpileModule([...functions.values()].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.createContext(context);
  vm.runInContext(compiled, context);
  function loaded(mode = "bot_token", ready = true) {
    context.commandDeliveryState = { scope, available: true, mode, httpsReady: ready };
    context.commandDeliveryDraft = { scope, mode: mode === "https" ? "bot_token" : "https" };
  }
  function move(appId = id(11), ownerId = owner) {
    context.user = { id: ownerId }; context.identityRef.current = ownerId;
    context.selectedBot = { app_id: appId, bot_id: id(21) };
    context.selectionRef.current = { appId, botId: id(21) };
    context.detailsRequestRef.current++;
  }
  return { context, app, owner, scope, calls, notices, loaded, move };
}

test("command-delivery projection is strict and never stores endpoint or secret fields", () => {
  const { context, scope } = fixture();
  assert.deepEqual(clone(context.parseCommandDeliveryState({ mode: "bot_token", https_ready: false, signing_secret: "not-for-ui", endpoint_url: "https://not-for-ui.example" }, scope)), {
    scope, available: true, mode: "bot_token", httpsReady: false,
  });
  for (const row of [{}, { mode: "polling", https_ready: false }, { mode: "https", https_ready: "true" }, null]) {
    assert.throws(() => context.parseCommandDeliveryState(row, scope), /Could not confirm command delivery settings/);
  }
});

test("loading existing settings is read-only and missing/malformed server support stays unavailable", async () => {
  const { context, app, calls } = fixture();
  await context.loadCommandDeliveryMode(app);
  assert.deepEqual(calls, [["bots_get_command_delivery_mode_v1", { p_app_id: app.app_id }]]);
  assert.equal(context.commandDeliveryState.mode, "bot_token");
  context.reply = () => { throw { code: "PGRST202", message: "SQL internals never shown" }; };
  await context.loadCommandDeliveryMode(app);
  assert.equal(context.commandDeliveryState.available, false);
  assert.equal(context.commandDeliveryState.error.includes("SQL"), false);
  context.reply = () => ({ mode: "https" });
  await context.loadCommandDeliveryMode(app);
  assert.equal(context.commandDeliveryState.available, false);
  assert.equal(calls.some(([name]) => name.includes("set_")), false);
});

test("only explicit confirmed owner selection writes the mode; HTTPS needs readiness", async () => {
  const { context, loaded, calls, notices, app } = fixture();
  loaded("bot_token", false);
  await context.handleSaveCommandDeliveryMode();
  assert.equal(calls.some(([name]) => name === "bots_set_command_delivery_mode_v1"), false);
  assert.match(notices.at(-1).message, /Verify.*HTTPS endpoint/);
  loaded("bot_token", true);
  context.reply = () => ({ mode: "https", https_ready: true });
  await context.handleSaveCommandDeliveryMode();
  assert.deepEqual(calls.find(([name]) => name === "bots_set_command_delivery_mode_v1"), ["bots_set_command_delivery_mode_v1", { p_app_id: app.app_id, p_mode: "https" }]);
  assert.equal(context.commandDeliveryState.mode, "https");
  assert.equal(context.commandDeliveryDraft, null);
  assert.match(notices.at(-1).message, /HTTPS/);
});

test("failed or wrong-mode saves retain the draft without publishing misleading success", async () => {
  const { context, loaded, notices } = fixture();
  loaded();
  context.reply = () => { throw Error("NEVER_ECHO_SIGNING_SECRET"); };
  await context.handleSaveCommandDeliveryMode();
  assert.equal(context.commandDeliveryDraft.mode, "https");
  assert.equal(context.commandDeliveryState.mode, "bot_token");
  assert.equal(notices.at(-1).tone, "error");
  assert.equal(notices.at(-1).message.includes("NEVER_ECHO"), false);
  context.reply = () => ({ mode: "bot_token", https_ready: true });
  await context.handleSaveCommandDeliveryMode();
  assert.equal(context.commandDeliveryDraft.mode, "https");
  assert.equal(notices.at(-1).tone, "error");
});

test("late reads cannot roll back an acknowledged save or overwrite a newer read", async () => {
  const { context, app, loaded } = fixture();
  const old = defer();
  context.reply = name => name.includes("get_") ? old.promise : { mode: "https", https_ready: true };
  const reading = context.loadCommandDeliveryMode(app);
  loaded();
  await context.handleSaveCommandDeliveryMode();
  old.resolve({ mode: "bot_token", https_ready: false }); await reading;
  assert.equal(context.commandDeliveryState.mode, "https");
  const first = defer(); let count = 0;
  context.reply = () => ++count === 1 ? first.promise : { mode: "bot_token", https_ready: true };
  const older = context.loadCommandDeliveryMode(app);
  await context.loadCommandDeliveryMode(app);
  first.resolve({ mode: "https", https_ready: false }); await older;
  assert.equal(context.commandDeliveryState.mode, "bot_token");
  assert.equal(context.commandDeliveryState.httpsReady, true);
});

test("saving/testing the endpoint only refreshes readiness and preserves an unsaved mode choice", async () => {
  const { context, loaded, calls } = fixture();
  loaded();
  let verified = false;
  context.reply = name => name === "bots_get_command_delivery_mode_v1"
    ? { mode: "bot_token", https_ready: verified } : { endpoint_url: "https://fixture.example/altara/interactions", last_status: verified ? "verified" : "saved" };
  await context.handleSaveEndpoint({ get: () => "https://fixture.example/altara/interactions" });
  assert.equal(context.commandDeliveryState.mode, "bot_token");
  assert.equal(context.commandDeliveryState.httpsReady, false);
  assert.equal(context.commandDeliveryDraft.mode, "https");
  verified = true;
  await context.handleTestEndpoint();
  assert.equal(context.commandDeliveryState.mode, "bot_token");
  assert.equal(context.commandDeliveryState.httpsReady, true);
  assert.equal(context.commandDeliveryDraft.mode, "https");
  assert.equal(calls.some(([name]) => name === "bots_set_command_delivery_mode_v1"), false);
  assert.equal(calls.filter(([name]) => name === "edge").length, 1);
});

test("account/app changes and A-B-A navigation fence late reads and save feedback", async () => {
  for (const action of ["read", "save"]) {
    const { context, app, loaded, move, notices } = fixture();
    loaded();
    const pending = defer(); context.reply = () => pending.promise;
    const running = action === "read" ? context.loadCommandDeliveryMode(app) : context.handleSaveCommandDeliveryMode();
    move(); move(app.app_id, id(2)); move(app.app_id, id(1));
    context.selectionRef.current.botId = app.bot_id; context.selectedBot = app;
    context.commandDeliveryState = null; context.commandDeliveryDraft = null;
    pending.resolve({ mode: "https", https_ready: true }); await running;
    assert.equal(context.commandDeliveryState, null, action);
    assert.equal(notices.length, 0, action);
  }
});

test("one pending save stays locked and a edited draft is preserved after acknowledgement", async () => {
  const { context, loaded, calls, scope } = fixture();
  loaded();
  const pending = defer(); context.reply = () => pending.promise;
  const first = context.handleSaveCommandDeliveryMode();
  await context.handleSaveCommandDeliveryMode();
  assert.equal(calls.filter(([name]) => name === "bots_set_command_delivery_mode_v1").length, 1);
  context.commandDeliveryDraft = { scope, mode: "bot_token" };
  pending.resolve({ mode: "https", https_ready: true }); await first;
  assert.equal(context.commandDeliveryDraft.mode, "bot_token");
  assert.equal(context.busyAction, "");
});

test("native delivery form is separate from URL save and exposes only eligible choices", () => {
  const { context, scope } = fixture();
  const props = { endpoint: { endpoint_url: "https://fixture.example/altara/interactions", last_status: "verified" }, busy: "", onSave() {}, onTest() {},
    delivery: { scope, available: true, mode: "bot_token", httpsReady: false }, deliveryMode: "bot_token", deliveryDirty: false, onDeliveryModeChange() {}, onSaveDeliveryMode() {},
  };
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(context.WebhooksPage, props));
  assert.equal((html.match(/<form\b/g) || []).length, 2);
  assert.match(html, /Command delivery/);
  assert.match(html, /Bot Token Connection/);
  assert.match(html, /<option value="https" disabled=""/);
  assert.match(html, /Save delivery mode/);
  assert.match(html, /Verify.*endpoint/);
  assert.doesNotMatch(html, /NEVER_ECHO_SIGNING_SECRET/);
  assert.match(source, /commandDeliveryDraft\?\.scope === scopeKey/);
  assert.match(source, /onSaveDeliveryMode=\{handleSaveCommandDeliveryMode\}/);
  assert.match(source, /loadCommandDeliveryMode\(selectedBot\)/);
});

test("explicit signing-key replacement calls only the existing owner RPC and refreshes readiness", async () => {
  const { context, app, owner, loaded, calls } = fixture({ secrets: true });
  loaded();
  context.secretNotice = { kind: "bot-token", value: "existing-token", userId: owner, appId: app.app_id };
  context.reply = name => name === "bots_rotate_signing_secret"
    ? [{ app_id: app.app_id, signing_secret: "isolated-signing-key", signing_secret_prefix: "isolated" }]
    : { mode: "bot_token", https_ready: false };
  await context.handleRotateSigningSecret();
  assert.deepEqual(calls.filter(([name]) => name.startsWith("bots_")), [
    ["bots_rotate_signing_secret", { p_app_id: app.app_id }], ["bots_get_command_delivery_mode_v1", { p_app_id: app.app_id }],
  ]);
  assert.deepEqual(clone(context.secretNotice), { kind: "signing-secret", label: "Signing secret shown once", value: "isolated-signing-key", userId: owner, appId: app.app_id });
  assert.equal(context.commandDeliveryState.mode, "bot_token");
  assert.equal(context.commandDeliveryDraft.mode, "https");
  assert.equal(calls.some(([name]) => name === "bots_set_command_delivery_mode_v1" || name === "bots_save_interaction_endpoint"), false);
});

test("malformed signing-key acknowledgements never expose a value or erase a bot-token notice", async () => {
  const payloads = [[], { app_id: id(10), signing_secret: "not-array", signing_secret_prefix: "prefix" },
    [{ app_id: id(11), signing_secret: "other-app-key", signing_secret_prefix: "prefix" }],
    [{ app_id: id(10), signing_secret: "", signing_secret_prefix: "prefix" }],
    [{ app_id: id(10), signing_secret: "key", signing_secret_prefix: null }],
    [{ app_id: id(10), signing_secret: 123, signing_secret_prefix: "prefix" }],
    [{ app_id: id(10), signing_secret: "key", signing_secret_prefix: "prefix" }, {}]];
  for (const payload of payloads) {
    const { context, app, owner, notices } = fixture({ secrets: true });
    const token = { kind: "bot-token", value: "existing-token", userId: owner, appId: app.app_id };
    context.secretNotice = token; context.reply = () => payload;
    await context.handleRotateSigningSecret();
    assert.equal(context.secretNotice, token);
    assert.equal(notices.at(-1).tone, "error");
    assert.doesNotMatch(notices.at(-1).message, /other-app-key|not-array/);
  }
});

test("rotation denial is safe and one pending replacement stays locked", async () => {
  const { context, app, owner, calls, notices } = fixture({ secrets: true });
  context.secretNotice = { kind: "bot-token", value: "existing-token", userId: owner, appId: app.app_id };
  const pending = defer(); context.reply = () => pending.promise;
  const first = context.handleRotateSigningSecret();
  await context.handleRotateSigningSecret();
  assert.equal(calls.filter(([name]) => name === "bots_rotate_signing_secret").length, 1);
  pending.reject(Error("DENIED_WITH_PRIVATE_KEY_NEVER_ECHO")); await first;
  assert.equal(context.secretNotice.kind, "bot-token");
  assert.equal(notices.at(-1).tone, "error");
  assert.doesNotMatch(notices.at(-1).message, /DENIED_WITH_PRIVATE_KEY/);
  assert.equal(context.busyAction, "");
});

test("account/app A-B-A fences late signing values and errors before they reach the page", async () => {
  for (const failure of [false, true]) {
    const { context, app, move, notices } = fixture({ secrets: true });
    const pending = defer(); context.reply = () => pending.promise;
    const rotating = context.handleRotateSigningSecret();
    move(); move(app.app_id, id(2)); move(app.app_id, id(1));
    context.selectionRef.current.botId = app.bot_id; context.selectedBot = app;
    if (failure) pending.reject(Error("DO_NOT_SHOW_STALE_ERROR"));
    else pending.resolve([{ app_id: app.app_id, signing_secret: "DO_NOT_SHOW_STALE_KEY", signing_secret_prefix: "prefix" }]);
    await rotating;
    assert.equal(context.secretNotice, null);
    assert.equal(notices.length, 0);
  }
});

test("native signing-key controls require arm then confirm, show impact and never rotate on render/cancel", async () => {
  const { context } = fixture({ secrets: true });
  let armed = false, rotations = 0, focused = 0;
  const trigger = { isConnected: true, disabled: false, focus() { focused++; } };
  const event = { currentTarget: { closest: () => ({ querySelector: () => trigger }) } };
  context.useState = () => [armed, value => { armed = value; }];
  const props = { endpoint: null, busy: "", onSave() {}, onTest() {}, delivery: null, deliveryMode: "bot_token", deliveryDirty: false,
    onDeliveryModeChange() {}, onSaveDeliveryMode() {}, async onRotateSigningSecret() { rotations++; },
  };
  const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  const button = (tree, text) => nodes(tree).find(node => node.type === "button" && node.props.children === text);
  let tree = context.WebhooksPage(props);
  assert.equal(rotations, 0);
  assert.equal(button(tree, "Replace signing secret"), undefined);
  button(tree, "Rotate signing secret").props.onClick();
  tree = context.WebhooksPage(props);
  assert.equal(rotations, 0);
  assert.ok(button(tree, "Replace signing secret"));
  assert.match(ReactDOMServer.renderToStaticMarkup(tree), /old key|old signing secret|interrupt.*HTTPS/i);
  assert.equal(button(tree, "Cancel").props.autoFocus, true);
  button(tree, "Cancel").props.onClick(event);
  assert.equal(rotations, 0);
  assert.equal(focused, 1);
  tree = context.WebhooksPage(props); button(tree, "Rotate signing secret").props.onClick();
  tree = context.WebhooksPage(props); button(tree, "Replace signing secret").props.onClick(event);
  await Promise.resolve();
  assert.equal(rotations, 1);
  assert.equal(armed, false);
  assert.equal(focused, 2);
  tree = context.WebhooksPage({ ...props, busy: "rotate-signing-secret" });
  assert.equal(button(tree, "Rotate signing secret").props.disabled, true);
});

test("one-time secret display escapes values and copy remains bound to the owner/app", async () => {
  const { context, app, owner, calls, notices, move } = fixture({ secrets: true });
  const secret = { kind: "signing-secret", label: "Signing secret shown once", value: "fixture<key>&value", userId: owner, appId: app.app_id };
  const html = ReactDOMServer.renderToStaticMarkup(context.StatusNotice({ notice: null, secret, onCopySecret() {} }));
  assert.match(html, /Copy now/);
  assert.match(html, /fixture&lt;key&gt;&amp;value/);
  assert.doesNotMatch(html, /fixture<key>/);
  await context.handleCopySecret(secret);
  assert.deepEqual(calls.at(-1), ["clipboard", secret.value]);
  assert.equal(notices.at(-1).message, "Signing secret copied.");
  const token = { ...secret, kind: "bot-token", value: "fixture-bot-token" };
  await context.handleCopySecret(token);
  assert.equal(notices.at(-1).message, "Token copied.");
  const copied = calls.length; move();
  await context.handleCopySecret(secret);
  assert.equal(calls.length, copied);
  assert.match(source, /kind: "bot-token" \| "signing-secret"/);
  assert.match(source, /secretNotice\?\.userId === user\?\.id && secretNotice\?\.appId === selectedBot\?\.app_id/);
});
