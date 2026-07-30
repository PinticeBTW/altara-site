import {
  createWindowsArtifactRedirectResponse,
  WINDOWS_RELEASE_CACHE_SECONDS,
} from "../../../lib/altara-linux-release";

export const revalidate = 300;

if (revalidate !== WINDOWS_RELEASE_CACHE_SECONDS) {
  throw new Error("Windows download route cache configuration is inconsistent.");
}

export async function GET() {
  return createWindowsArtifactRedirectResponse();
}
