import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { GET as getTryRoute } from "../app/try/route.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const appRoot = path.join(repositoryRoot, "public", "app");

async function readAppFile(relativePath) {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

function getRelativeModuleSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1].startsWith(".")) specifiers.push(match[1]);
  }
  return specifiers;
}

async function collectLocalModuleGraph(entryPath) {
  const visited = new Set();
  const pending = [path.resolve(appRoot, entryPath)];

  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    await access(current);
    visited.add(current);

    const source = await readFile(current, "utf8");
    for (const specifier of getRelativeModuleSpecifiers(source)) {
      pending.push(path.resolve(path.dirname(current), specifier));
    }
  }

  return visited;
}

function extractFunction(source, name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.notEqual(functionStart, -1, `missing function ${name}`);
  const asyncStart = source.lastIndexOf("async ", functionStart);
  const start = asyncStart >= 0 && functionStart - asyncStart < 16 ? asyncStart : functionStart;
  const bodyMarker = /\)\s*\{/.exec(source.slice(functionStart));
  assert.ok(bodyMarker, `missing body for function ${name}`);
  const bodyStart = functionStart + bodyMarker.index + bodyMarker[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

test("login form is visible before JavaScript or optional dependencies execute", async () => {
  const [html, css] = await Promise.all([
    readAppFile("login.html"),
    readAppFile("style.css"),
  ]);
  const bodyClasses = html.match(/<body\s+class="([^"]*)"[^>]*data-auth-page="login"/)?.[1]?.split(/\s+/) || [];

  assert.ok(bodyClasses.includes("authPage"));
  assert.ok(!bodyClasses.includes("auth-checking"));
  assert.match(html, /<input id="email"/);
  assert.match(html, /<input id="password"/);
  assert.match(html, /<button class="btn primary" id="btnLogin">/);
  assert.match(css, /body\.authPage\.auth-checking \.authShell\s*{[^}]*opacity:\s*0/s);
});

test("login module graph contains every required local dependency", async () => {
  const graph = await collectLocalModuleGraph("login.js");
  assert.ok(graph.has(path.join(appRoot, "desktopWindowControls.js")));
  assert.ok(graph.has(path.join(appRoot, "authOnboarding.js")));
  assert.ok(graph.has(path.join(appRoot, "supabaseClient.js")));
});

test("successful authentication keeps the existing same-origin redirect behavior", async () => {
  const source = await readAppFile("login.js");
  const resolveSource = extractFunction(source, "resolvePostLoginReturnUrl");
  const redirectSource = extractFunction(source, "redirectAfterSuccessfulLogin");
  let redirectedTo = "";
  const context = {
    URL,
    window: {
      location: {
        href: "https://www.altaraapp.com/app/login.html",
        origin: "https://www.altaraapp.com",
        replace(value) { redirectedTo = value; },
      },
    },
  };

  vm.runInNewContext(`${resolveSource}\n${redirectSource}\nredirectAfterSuccessfulLogin();`, context);
  assert.equal(redirectedTo, "./index.html");
  assert.match(source, /setAuthFeedback\([^;]+success[^;]+\);\s*redirectAfterSuccessfulLogin\(\);/s);
});

test("missing local session still redirects away from authenticated app state", async () => {
  const source = await readAppFile("ui.js");
  const clearSource = extractFunction(source, "clearConclusiveInvalidAuthStateAndRedirect");
  const requireSource = extractFunction(source, "requireAuth");
  let redirectedTo = "";
  const context = {
    ALTARA_AUTH_STATE: {
      VALID_SESSION: "valid_session",
      NETWORK_INDETERMINATE: "network_indeterminate",
      BACKEND_TEMPORARILY_UNAVAILABLE: "backend_temporarily_unavailable",
      NO_LOCAL_SESSION: "no_local_session",
      CONCLUSIVELY_INVALID_SESSION: "conclusively_invalid_session",
      UNEXPECTED_BOOT_ERROR: "unexpected_boot_error",
    },
    clearStoredAuthState() {},
    async resolveAuthenticatedSessionState() {
      return { category: "no_local_session", user: null };
    },
    window: { location: { replace(value) { redirectedTo = value; } } },
  };

  const result = await vm.runInNewContext(
    `${clearSource}\n${requireSource}\nrequireAuth("./login.html");`,
    context,
  );
  assert.equal(result, null);
  assert.equal(redirectedTo, "./login.html");
});

test("try route remains valid on apex and www origins", async () => {
  const previousWebUrl = process.env.ALTARA_WEB_URL;
  const previousPublicUrl = process.env.NEXT_PUBLIC_TRY_IN_BROWSER_URL;
  delete process.env.ALTARA_WEB_URL;
  delete process.env.NEXT_PUBLIC_TRY_IN_BROWSER_URL;

  try {
    for (const origin of ["https://altaraapp.com", "https://www.altaraapp.com"]) {
      const response = await getTryRoute(new Request(`${origin}/try`));
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `${origin}/app/index.html`);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  } finally {
    if (previousWebUrl === undefined) delete process.env.ALTARA_WEB_URL;
    else process.env.ALTARA_WEB_URL = previousWebUrl;
    if (previousPublicUrl === undefined) delete process.env.NEXT_PUBLIC_TRY_IN_BROWSER_URL;
    else process.env.NEXT_PUBLIC_TRY_IN_BROWSER_URL = previousPublicUrl;
  }
});
