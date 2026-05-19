/**
 * Minimal Database Type Stub
 *
 * Provides the shape required by @supabase/supabase-js generics.
 * Full generated types deferred until schema stabilizes (post-M2).
 *
 * To generate real types:
 *   npx supabase gen types typescript --project-id <id> > src/shared/supabase/database.types.ts
 */

export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
    CompositeTypes: Record<string, unknown>;
  };
}
