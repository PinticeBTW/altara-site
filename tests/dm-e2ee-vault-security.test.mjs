import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixturePath = "/tests/fixtures/dm-e2ee-vault-browser.html";
const chromePath = process.env.ALTARA_VAULT_CHROME_PATH
  || (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "/usr/bin/google-chrome");

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "application/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      const filePath = path.resolve(repositoryRoot, relativePath);
      const relative = path.relative(repositoryRoot, filePath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        response.writeHead(404).end("not found");
        return;
      }
      await stat(filePath);
      response.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(await readFile(filePath));
    } catch (_) {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}${fixturePath}` };
}

async function waitForDevTools(profilePath, child, readStderr) {
  const activePortPath = path.join(profilePath, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited before DevTools was ready: ${readStderr().slice(-1000)}`);
    }
    try {
      const [portLine] = String(await readFile(activePortPath, "utf8")).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools startup timed out: ${readStderr().slice(-1000)}`);
}

async function waitForPageWebSocket(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.url.includes("dm-e2ee-vault-browser.html"));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chrome test page was not available through DevTools");
}

async function evaluateThroughCdp(webSocketUrl, expression, timeoutMs = 200000) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let sequence = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP error"));
    else waiter.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = sequence++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  let timeoutHandle = null;
  try {
    const evaluated = await Promise.race([
      call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Chrome Vault test timed out")), timeoutMs);
      }),
    ]);
    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text || "Chrome evaluation failed");
    }
    return evaluated.result?.value;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    socket.close();
  }
}

async function runChromeVaultSuite(profile, url) {
  const childEnvironment = { ...process.env };
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    url,
  ], { cwd: repositoryRoot, env: childEnvironment, windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    const port = await waitForDevTools(profile, child, () => stderr);
    const webSocketUrl = await waitForPageWebSocket(port);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await evaluateThroughCdp(
      webSocketUrl,
      `new Promise((resolve, reject) => {
        const deadline = Date.now() + 180000;
        const check = () => {
          const element = document.getElementById("result");
          const status = element?.dataset?.status || "";
          if (status === "pass" || status === "fail") {
            resolve({ status, text: element.textContent || "" });
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error("vault_page_timeout"));
            return;
          }
          setTimeout(check, 50);
        };
        check();
      })`,
    );
  } finally {
    child.kill();
    if (child.exitCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(resolve, 5000);
      });
    }
  }
}

const staticServer = await startStaticServer();
test.after(async () => {
  await new Promise((resolve) => staticServer.server.close(resolve));
});

test("production-site Vault copy passes 32 real WebCrypto, IndexedDB, migration, recovery, and UI checks", async () => {
  await stat(chromePath);
  const profile = await mkdtemp(path.join(os.tmpdir(), "altara-site-vault-chrome-"));
  try {
    const payload = await runChromeVaultSuite(profile, staticServer.url);
    assert.ok(payload, "Chrome did not return a Vault test payload");
    const summary = JSON.parse(payload.text);
    assert.equal(payload.status, "pass", `Chrome failures: ${JSON.stringify(summary.failures || [])}`);
    assert.equal(summary.total, 32);
    assert.equal(summary.passed, 32);
    assert.equal(summary.failed, 0);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test("production app shell owns the exact hardened Vault module and recovery-first integration", async () => {
  const moduleSource = (await readFile(path.join(repositoryRoot, "public", "app", "lib", "dmE2ee.js"), "utf8")).replace(/\r\n/g, "\n");
  assert.equal(
    createHash("sha256").update(moduleSource).digest("hex"),
    // Canonical Vault source shared by 0.1.129 and this client-only release.
    "9a443eff4780c782c374bc2b10bc57bc468d3974b796f368867dcc9bbcffa43f",
  );
  const indexSource = await readFile(path.join(repositoryRoot, "public", "app", "index.html"), "utf8");
  assert.match(indexSource, /<script\s+type="module"\s+src="\/app\/app\.js[^"]*"><\/script>/);
  const appSource = await readFile(path.join(repositoryRoot, "public", "app", "app.js"), "utf8");
  assert.match(appSource, /from\s+"\.\/lib\/dmE2ee\.js"/);
  assert.match(appSource, /identityStatus === "migration_requires_recovery"/);
  assert.match(appSource, /data-dm-e2ee-act="\$\{recoveryAction\}"/);
  assert.match(appSource, /data-dm-e2ee-act="' \+ escAttr\(localRecoveryAction\) \+ '"/);
  assert.match(appSource, /rewrapDmE2eeKeyBackup\(\{/);
  assert.doesNotMatch(appSource, /awaitWithTimeout\(\s*setupDirectDmEncryptionForCurrentDevice[\s\S]{0,250}?15000/);
  assert.match(appSource, /function promptVaultProvisioningPassword\(\)/);
  assert.match(appSource, /setupDmE2eeIdentityForCurrentDevice\(\{[\s\S]*?backupPassword,[\s\S]*?includeRecoveryKey: false/);
  assert.doesNotMatch(
    appSource,
    /setupDmE2eeIdentityForCurrentDevice\(\{\s*userId:\s*state\.user\.id,\s*forceNew:\s*false\s*\}\)/,
  );
});
