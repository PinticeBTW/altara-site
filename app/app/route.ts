import { readFile } from "node:fs/promises";
import path from "node:path";

const APP_INDEX_PATH = path.join(process.cwd(), "public", "app", "index.html");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname === "/app") {
    return new Response("Opening Altara in your browser.", {
      status: 307,
      headers: {
        Location: new URL("/app/", request.url).toString(),
      },
    });
  }

  const indexHtml = await readFile(APP_INDEX_PATH, "utf8");

  return new Response(indexHtml, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
