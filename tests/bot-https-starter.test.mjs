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
const names = ["WebhooksPage", "BotStarterDownloads", "HostingPage", "Docs", "PageHeader", "appBase"];
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) functions.set(node.name.text, node.getText(parsed));
  ts.forEachChild(node, visit);
}
visit(parsed);
for (const name of names) assert.ok(functions.has(name), `${name} must come from the actual portal source`);
const compiled = ts.transpileModule([...functions.values()].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const zip = "/bot-starters/altara-webhook-node.zip";
const guide = "/bot-starters/ALTARA_BOTS_HTTPS_QUICKSTART.md";
const render = (component, props = {}) => ReactDOMServer.renderToStaticMarkup(React.createElement(component, props));
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
function fixture() {
  const calls = [];
  const context = { React, useState: React.useState, Link: props => React.createElement("a", props, props.children) };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  const action = name => () => calls.push(name);
  const props = {
    endpoint: { endpoint_url: "https://fixture.example/altara/interactions", signing_secret: "NEVER_RENDER_PRIVATE_KEY", last_status: "verified" },
    busy: "", delivery: { available: true, mode: "bot_token", httpsReady: false }, deliveryMode: "bot_token", deliveryDirty: false,
    onSave: action("save-endpoint"), onTest: action("test-endpoint"), onDeliveryModeChange: action("change-mode"),
    onSaveDeliveryMode: action("save-mode"), onRotateSigningSecret: action("rotate-key"),
  };
  return { context, props, calls };
}

test("Webhooks exposes the HTTPS source ZIP and complete quickstart without changing delivery", () => {
  const { context, props, calls } = fixture();
  const html = render(context.WebhooksPage, props);
  assert.match(html, new RegExp(`href="${zip.replaceAll(".", "\\.")}"[^>]*download`));
  assert.match(html, new RegExp(`href="${guide.replaceAll(".", "\\.")}"`));
  assert.match(html, /HTTPS bot \(JavaScript\)/);
  assert.match(html, /Bot Token Connection \(default\)/);
  assert.match(html, /<option value="https" disabled=""/);
  assert.doesNotMatch(html, /NEVER_RENDER_PRIVATE_KEY/);
  assert.deepEqual(calls, []);
});

test("HTTPS getting-started steps preserve registration and require verification before mode selection", () => {
  const { context, props, calls } = fixture();
  const html = render(context.WebhooksPage, props);
  const ordered = html.match(/<ol[^>]*class="[^"]*developerSetupSteps[^\"]*"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(ordered, "Use the native ordered setup steps");
  assert.equal((ordered.match(/<li\b/g) || []).length, 5);
  assert.ok(ordered.indexOf("npm ci") < ordered.indexOf("npm run register"));
  assert.ok(ordered.indexOf("npm run register") < ordered.indexOf("npm start"));
  assert.match(html, /dedicated test bot/i);
  assert.ok(html.indexOf("dedicated test bot") < html.indexOf("npm ci"));
  assert.match(ordered, /\.env.*private|private.*\.env/i);
  assert.match(ordered, /ALTARA_FUNCTIONS_URL[\s\S]*DEFAULT_FUNCTIONS_URL[\s\S]*altara-client\.js/);
  assert.match(ordered, /hosted ALTARA[\s\S]*deployment/);
  assert.match(ordered, /optional[\s\S]*five demo commands/i);
  assert.match(ordered, /preserv[\s\S]*existing commands/i);
  assert.match(ordered, /token[\s\S]*registration|registration[\s\S]*token/i);
  assert.match(ordered, /Test endpoint[\s\S]*verified[\s\S]*HTTPS[\s\S]*Save delivery mode/);
  assert.deepEqual(calls, []);
});

test("SDK downloads remain the primary choices and HTTPS stays an optional disclosure", () => {
  const { context } = fixture();
  const tree = context.BotStarterDownloads();
  const links = nodes(tree).filter(node => node.type === "a" && node.props.download && node.props.href.endsWith(".zip"));
  assert.deepEqual(links.slice(0, 3).map(node => node.props.href), [
    "/bot-starters/altara-faq-node.zip", "/bot-starters/altara-calculator-python.zip", "/bot-starters/altara-music-node.zip",
  ]);
  assert.ok(links.slice(0, 3).every(node => node.props.className.includes("primary")));
  assert.equal(links[3]?.props.href, zip);
  const optional = nodes(tree).find(node => node.type === "details" && nodes(node).some(child => child.type === "a" && child.props.href === zip));
  assert.ok(optional, "Keep the advanced download separate from the default SDK flow");
  assert.equal(optional.props.open, undefined);
  const html = render(context.BotStarterDownloads);
  assert.match(html, /HTTPS quickstart/);
  assert.match(html, /SDK starters sync the code registry at startup/);
  assert.match(html, /HTTPS starter uses a separate, explicit registration step/);
});

test("tutorial links are ordinary downloads and never carry sensitive action callbacks", () => {
  const { context, props, calls } = fixture();
  context.useState = () => [false, () => {}];
  const links = nodes(context.WebhooksPage(props)).filter(node => node.type === "a" && [zip, guide].includes(node.props.href));
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.equal(link.props.onClick, undefined);
    assert.equal(link.props.action, undefined);
    assert.equal(link.props.onSubmit, undefined);
    assert.equal(link.props.href.includes("?"), false);
  }
  assert.deepEqual(calls, []);
});

test("Portal support text matches the existing music publisher and both interactive transports", () => {
  const { context } = fixture();
  const hosting = render(context.HostingPage, { appId: "fixture-app" });
  const docs = render(context.Docs);
  assert.doesNotMatch(hosting, /still needs an audio publisher/i);
  assert.match(hosting, /RTC audio publisher/);
  assert.match(docs, /Buttons, selection menus and text forms[^<]*Bot Token Connection[^<]*HTTPS/);
  assert.match(docs, /ALTARA_BOTS_COMPONENTS\.md/);
});
