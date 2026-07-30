import {
  createLinuxArtifactRedirectResponse,
  createWindowsArtifactRedirectResponse,
} from "../lib/altara-linux-release";
import { createPlatformAwareDownloadResponse } from "../lib/altara-download-platform";

export const revalidate = 0;

export async function GET(request: Request) {
  return createPlatformAwareDownloadResponse(request.headers, {
    windows: () => createWindowsArtifactRedirectResponse(),
    linux: () => createLinuxArtifactRedirectResponse("application"),
  });
}
