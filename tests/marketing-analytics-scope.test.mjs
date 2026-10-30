import assert from "node:assert/strict";
import { test } from "node:test";
import { isMarketingAnalyticsAllowed } from "../app/lib/marketing-analytics-scope.ts";

function page(pathname, overrides = {}) {
  return { hostname: "www.altaraapp.com", pathname, search: "", hash: "", ...overrides };
}

test("Clarity is scoped to public marketing pages on the production site", () => {
  for (const path of ["/", "/features", "/faq", "/about", "/downloads", "/privacy", "/terms", "/discord-alternative", "/download/linux"]) {
    assert.equal(isMarketingAnalyticsAllowed(page(path)), true, path);
  }
  assert.equal(isMarketingAnalyticsAllowed(page("/", { hostname: "altaraapp.com" })), true);
});

test("Clarity excludes app, developer, preview, and parameterized URLs", () => {
  for (const path of ["/app", "/app/", "/app/index.html", "/login.html", "/developers", "/developers/applications", "/developers/themes", "/marketplace", "/widgets", "/themes", "/oauth2/authorize", "/unknown"]) {
    assert.equal(isMarketingAnalyticsAllowed(page(path)), false, path);
  }
  assert.equal(isMarketingAnalyticsAllowed(page("/", { hostname: "localhost" })), false);
  assert.equal(isMarketingAnalyticsAllowed(page("/", { hostname: "preview.altaraapp.com" })), false);
  assert.equal(isMarketingAnalyticsAllowed(page("/", { search: "?server_invite=secret" })), false);
  assert.equal(isMarketingAnalyticsAllowed(page("/", { hash: "#secret" })), false);
});
