import { createManualWindowsArtifactRedirectResponse } from "../../../lib/altara-linux-release";

export const revalidate = 0;

export async function GET() {
  return createManualWindowsArtifactRedirectResponse();
}
