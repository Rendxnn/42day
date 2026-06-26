export type ApiBindings = {
  APP_ENV: string;
  APP_BASE_URL?: string;
  DASHBOARD_ALLOWED_ORIGINS?: string;

  META_VERIFY_TOKEN: string;
  META_ACCESS_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  META_WABA_ID: string;
  META_GRAPH_API_VERSION?: string;

  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DATABASE_URL?: string;

  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  AI_CONFIG_ENCRYPTION_KEY?: string;
};
