import "./lib/browserAccountContext.js";
// supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
import { createRealtimeConnectionHealth } from "./lib/realtimeConnectionHealth.js";
import { createRealtimeStartupBarrier } from "./lib/realtimeStartupBarrier.js";
import {
  getApplicationSupabaseClientRegistrySnapshot,
  registerApplicationSupabaseClient,
} from "./lib/supabaseClientRuntime.js";

// Mete aqui os teus valores (Project Settings -> API)
export const SUPABASE_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmd3am1tYWljbGtoc3NpbWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Njg5MzcsImV4cCI6MjA4NjM0NDkzN30.EIdR7FeqojB7hyLtyp8_ij75JN6AsIaE17jnCxUnqUA";

export const realtimeConnectionHealth = createRealtimeConnectionHealth({
  workerEnabled: true,
});
export const realtimeStartupBarrier = createRealtimeStartupBarrier();

const handleRealtimeHeartbeat = (status, latencyMs) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (["timeout", "disconnected", "error"].includes(normalizedStatus)) {
    // Close the current-generation gate synchronously. Phoenix reports the
    // heartbeat failure before it marks joined channels errored, so detaching
    // feature channels here prevents their internal socket-open rejoin path
    // from bypassing the application subscribe guard.
    realtimeStartupBarrier.invalidateCurrentGeneration(`heartbeat:${normalizedStatus}`);
    void realtimeStartupBarrier.suspendNonPresenceChannels(`heartbeat:${normalizedStatus}`);
  }
  realtimeConnectionHealth.handleHeartbeat(status, latencyMs);
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    worker: true,
    heartbeatCallback: handleRealtimeHeartbeat,
  },
});
const applicationClientRegistration = registerApplicationSupabaseClient(supabase);
realtimeStartupBarrier.install(supabase, {
  clientId: applicationClientRegistration.clientId,
  clientCreatedAt: applicationClientRegistration.createdAt,
  getClientRegistrySnapshot: () => getApplicationSupabaseClientRegistrySnapshot(),
});
realtimeConnectionHealth.attachClient(supabase.realtime);
// 2.112.4's constructor wrapper does not forward a disconnected callback.
// The documented public observer receives all five statuses.
supabase.realtime.onHeartbeat(handleRealtimeHeartbeat);
