import type { ApiBindings } from "../../../lib/bindings";
import { SupabaseRestError } from "../../../lib/supabase-rest";
import type { AdminAuthUser } from "../types";

export async function createAuthAdminUser(
  env: ApiBindings,
  input: {
    email: string;
    password: string;
    name: string;
  },
): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: buildAuthAdminHeaders(env),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        source: "admin_console",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_create_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

export async function updateAuthAdminUser(env: ApiBindings, userId: string, patch: Record<string, unknown>): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: buildAuthAdminHeaders(env),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_update_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

export async function getAuthAdminUser(env: ApiBindings, userId: string): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    headers: buildAuthAdminHeaders(env),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_get_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

export async function findAuthAdminUserByEmail(env: ApiBindings, email: string): Promise<AdminAuthUser | undefined> {
  const targetEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    const response = await fetch(url.toString(), {
      headers: buildAuthAdminHeaders(env),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseRestError("supabase_auth_admin_list_users_failed", response.status, body);
    }

    const payload = await response.json() as { users?: AdminAuthUser[] };
    const users = payload.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (found) return found;
    if (users.length < 100) return undefined;
  }

  return undefined;
}

export function buildAuthAdminHeaders(env: ApiBindings): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}
