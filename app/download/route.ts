import {
  createManualLinuxArtifactRedirectResponse,
  createManualWindowsArtifactRedirectResponse,
} from "../lib/altara-linux-release";
import { createPlatformAwareDownloadResponse } from "../lib/altara-download-platform";

export const revalidate = 0;

export async function GET(request: Request) {
  return createPlatformAwareDownloadResponse(request.headers, {
    windows: () => createManualWindowsArtifactRedirectResponse(),
    linuxDebian: () => createManualLinuxArtifactRedirectResponse("debian"),
    linuxGeneric: () => createManualLinuxArtifactRedirectResponse("application"),
  });
}
