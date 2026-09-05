import { createManualLinuxArtifactRedirectResponse } from "../../../../lib/altara-linux-release";

export const revalidate = 0;

export async function GET() {
  return createManualLinuxArtifactRedirectResponse("readme");
}
