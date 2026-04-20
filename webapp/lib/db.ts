import "server-only";
import postgres, { type Sql } from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __pg: Sql | undefined;
}

function make(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // Supabase pgbouncer transaction pool
    connection: { application_name: "workbot-webapp" },
  });
}

function client(): Sql {
  return (globalThis.__pg ??= make());
}

/**
 * Lazy callable proxy — the real `postgres()` client isn't built until the
 * first query, so `next build` can run without DATABASE_URL.
 */
const target = function lazy() {
  /* noop — only needed to make Proxy target callable */
} as unknown as Sql;

export const sql = new Proxy(target, {
  get(_t, prop) {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop as string | symbol];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
  apply(_t, _this, args: unknown[]) {
    // postgres's Sql is callable as a tagged template
    return (client() as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as Sql;
