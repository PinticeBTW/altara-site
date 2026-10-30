import { handleVoiceAnalytics } from "../../../lib/server/voice-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handleVoiceAnalytics;
