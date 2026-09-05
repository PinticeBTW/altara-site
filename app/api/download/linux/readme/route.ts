import { createLinuxArtifactRedirectResponse } from "../../../../lib/altara-linux-release";

export const revalidate = 0;

export async function GET() {
  return createLinuxArtifactRedirectResponse("readme");
}
