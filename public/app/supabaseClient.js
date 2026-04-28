// supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mete aqui os teus valores (Project Settings -> API)
export const SUPABASE_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmd3am1tYWljbGtoc3NpbWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Njg5MzcsImV4cCI6MjA4NjM0NDkzN30.EIdR7FeqojB7hyLtyp8_ij75JN6AsIaE17jnCxUnqUA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
