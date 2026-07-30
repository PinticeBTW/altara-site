import {
  createLinuxArtifactRedirectResponse,
  LINUX_RELEASE_CACHE_SECONDS,
} from "../../../lib/altara-linux-release";

export const revalidate = 600;

if (revalidate !== LINUX_RELEASE_CACHE_SECONDS) {
  throw new Error("Linux download route cache configuration is inconsistent.");
}

export async function GET() {
  return createLinuxArtifactRedirectResponse("application");
}
