import type { Context } from "hono";
import type { ApiBindings } from "../../lib/bindings.ts";
import { isSystemAdmin, requireAuthUser } from "../dashboard/auth.ts";
import type { DashboardContext } from "../dashboard/types.ts";

export type AgentContext = {
  userId: string;
  clientId: string;
  email?: string;
};

type JwtPayload = {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  client_id?: string;
};

type JsonWebKeyWithMetadata = JsonWebKey & { kid?: string; alg?: string; kty?: string };
const jwksCache = new Map<string, { expiresAt: number; keys: JsonWebKeyWithMetadata[] }>();

export async function requireAgentContext(c: Context<{ Bindings: ApiBindings }>): Promise<AgentContext | Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) return oauthChallenge(c, "invalid_token");
  const payload = decodeJwtPayload(token) ?? (c.env.APP_ENV === "test" ? {} : undefined);
  if (!payload) return oauthChallenge(c, "invalid_token");

  if (c.env.APP_ENV !== "test") {
    const issuer = c.env.MCP_OAUTH_ISSUER?.trim() || `${c.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
    const audience = c.env.MCP_JWT_AUDIENCE?.trim() || "authenticated";
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== issuer || !audienceMatches(payload.aud, audience) || !Number.isFinite(payload.exp) || !payload.exp || payload.exp <= now || (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > now + 60)) || !isUuid(payload.sub) || !isUuid(payload.client_id)) {
      return oauthChallenge(c, "invalid_token");
    }
    if (!(await verifyJwt(token, c.env))) return oauthChallenge(c, "invalid_token");
  }

  const authUser = await requireAuthUser(c as unknown as DashboardContext);
  if (authUser instanceof Response) return authUser;
  if (!isSystemAdmin(authUser) || (payload.sub && payload.sub !== authUser.id)) return c.json({ error: "admin_forbidden" }, 403);
  const clientId = payload.client_id ?? (c.env.APP_ENV === "test" ? "test-client" : "");
  const allowed = (c.env.MCP_ALLOWED_CLIENT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!clientId || (c.env.APP_ENV !== "test" && (allowed.length === 0 || !allowed.includes(clientId))) || (c.env.APP_ENV === "test" && allowed.length > 0 && !allowed.includes(clientId))) return c.json({ error: "mcp_client_forbidden" }, 403);
  return { userId: authUser.id, clientId, email: authUser.email };
}

export function oauthChallenge(c: Context<{ Bindings: ApiBindings }>, error: string) {
  c.header("WWW-Authenticate", `Bearer error="${error}", resource_metadata="${new URL("/.well-known/oauth-protected-resource", c.req.url).toString()}"`);
  return c.json({ error: "unauthorized" }, 401);
}

function bearerToken(value: string | undefined) { return value?.startsWith("Bearer ") ? value.slice(7).trim() : ""; }

function decodeJwtPayload(token: string): JwtPayload | undefined {
  try { const part = token.split(".")[1]; if (!part) return undefined; return JSON.parse(new TextDecoder().decode(fromBase64Url(part))) as JwtPayload; } catch { return undefined; }
}

function audienceMatches(aud: string | string[] | undefined, expected: string) { return Array.isArray(aud) ? aud.includes(expected) : aud === expected; }

async function verifyJwt(token: string, env: ApiBindings) {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) return false;
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedHeader))) as { kid?: string; alg?: string };
    if (!header.kid || !header.alg) return false;
    const jwksUrl = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
    let keys = await getJwks(jwksUrl);
    let jwk = keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg));
    if (!jwk) {
      keys = await getJwks(jwksUrl, true);
      jwk = keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg));
    }
    if (!jwk) return false;
    const algorithm = header.alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : header.alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : undefined;
    if (!algorithm) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);
    const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signature = fromBase64Url(encodedSignature);
    return crypto.subtle.verify(header.alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" }, key, signature, data);
  } catch { return false; }
}

async function getJwks(url: string, forceRefresh = false) {
  const cached = jwksCache.get(url);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("jwks_unavailable");
  const body = await response.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; kty?: string }> };
  const keys = body.keys ?? [];
  jwksCache.set(url, { keys, expiresAt: Date.now() + 5 * 60_000 });
  return keys;
}

function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
