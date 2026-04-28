import { readFile } from "node:fs/promises";
import path from "node:path";

const APP_BASE_HREF = "/app/";
const APP_INDEX_PATH = path.join(process.cwd(), "public", "app", "index.html");

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const indexHtml = await readFile(APP_INDEX_PATH, "utf8");

  return new Response(withAppBaseHref(indexHtml), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function withAppBaseHref(html: string) {
  if (/<base\s/i.test(html)) {
    return html;
  }

  return html.replace(/<head([^>]*)>/i, `<head$1>\n  <base href="${APP_BASE_HREF}" />`);
}
