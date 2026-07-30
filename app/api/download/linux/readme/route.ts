import { createLinuxArtifactRedirectResponse } from "../../../../lib/altara-linux-release";

export const revalidate = 600;

export async function GET() {
  return createLinuxArtifactRedirectResponse("readme");
}
