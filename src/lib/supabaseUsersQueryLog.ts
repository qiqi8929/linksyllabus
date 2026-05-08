/**
 * Structured logging for PostgREST `users` queries (debug 400 / missing column / RLS).
 * Safe for Vercel logs — never log tokens.
 */

export type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function normalizeError(err: unknown): PostgrestLikeError | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as PostgrestLikeError;
  return {
    code: e.code,
    message: e.message,
    details: e.details,
    hint: e.hint
  };
}

/** Call immediately before `.from("users").select(...)` */
export function logUsersQueryBefore(params: {
  context: string;
  userId: string;
  columns: string;
  filter?: string;
}): void {
  console.log("[Supabase users] BEFORE query", {
    context: params.context,
    userId: params.userId,
    columns: params.columns,
    filter: params.filter ?? "id eq userId"
  });
}

/** Call after await with data/error */
export function logUsersQueryAfter(params: {
  context: string;
  userId: string;
  columns: string;
  ok: boolean;
  error?: unknown;
  rowReturned?: boolean;
}): void {
  const err = normalizeError(params.error);
  if (params.ok && !err) {
    console.log("[Supabase users] AFTER query OK", {
      context: params.context,
      userId: params.userId,
      columns: params.columns,
      rowReturned: params.rowReturned ?? false
    });
    return;
  }
  console.error("[Supabase users] AFTER query FAILED", {
    context: params.context,
    userId: params.userId,
    columns: params.columns,
    rowReturned: params.rowReturned ?? false,
    code: err?.code,
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    /** Full PostgREST-style object for support tickets */
    raw: params.error
  });
}

export function logUsersUpdateBefore(params: {
  context: string;
  userId: string;
  patch: Record<string, unknown>;
}): void {
  console.log("[Supabase users] BEFORE update", {
    context: params.context,
    userId: params.userId,
    patch: params.patch
  });
}

export function logUsersUpdateAfter(params: {
  context: string;
  userId: string;
  ok: boolean;
  error?: unknown;
}): void {
  const err = normalizeError(params.error);
  if (params.ok && !err) {
    console.log("[Supabase users] AFTER update OK", {
      context: params.context,
      userId: params.userId
    });
    return;
  }
  console.error("[Supabase users] AFTER update FAILED", {
    context: params.context,
    userId: params.userId,
    code: err?.code,
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    raw: params.error
  });
}

export function logUsersUpsertBefore(params: {
  context: string;
  userId: string;
  fields: string[];
}): void {
  console.log("[Supabase users] BEFORE upsert", {
    context: params.context,
    userId: params.userId,
    fields: params.fields
  });
}

export function logUsersUpsertAfter(params: {
  context: string;
  userId: string;
  ok: boolean;
  error?: unknown;
}): void {
  const err = normalizeError(params.error);
  if (params.ok && !err) {
    console.log("[Supabase users] AFTER upsert OK", {
      context: params.context,
      userId: params.userId
    });
    return;
  }
  console.error("[Supabase users] AFTER upsert FAILED", {
    context: params.context,
    userId: params.userId,
    code: err?.code,
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    raw: params.error
  });
}
