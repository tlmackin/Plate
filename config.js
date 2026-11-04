/* Plate cloud settings.
   Paste the two values from Supabase: Project Settings → API (or "Connect" → App Frameworks).
   Both are safe to publish — the database rules (row level security) keep each person's log private.
   Leave them empty to run the app without accounts (log stays on the phone only). */
window.PLATE_CONFIG = {
  supabaseUrl: 'https://fnzcwsonutwmhqsytcgl.supabase.co',      // e.g. 'https://abcdefghijklmno.supabase.co'
  supabaseAnonKey: 'sb_publishable_-GtkwPYdaDQAKulW1irZIg_KiHT5Cc_',  // the "anon" / "publishable" key — NOT the service_role / secret key
};
