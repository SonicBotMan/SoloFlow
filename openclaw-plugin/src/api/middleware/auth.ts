/**
 * SoloFlow — Auth Middleware
 *
 * JWT token verification and API key validation for route protection.
 * Uses Bun's built-in `Bun.crypto` APIs — no external JWT library required.
 */

import type { ApiRequest, ApiResponse, Middleware } from "../types.js";
import { jsonError } from "../router.js";

export interface JwtAuthOptions {
  secret: string;
  algorithm?: "HS256" | "HS512";
}

export interface ApiKeyAuthOptions {
  validKeys: Set<string>;
  headerName?: string;
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = 4 - (padded.length % 4);
  return atob(pad < 4 ? padded + "=".repeat(pad) : padded);
}

function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSign(payload: string, secret: string, algo: string): Promise<string> {
  const algoName = algo === "HS512" ? "SHA-512" : "SHA-256";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algoName },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(payload: string, signature: string, secret: string, algo: string): Promise<boolean> {
  const expected = await hmacSign(payload, secret, algo);
  return expected === signature;
}

export function createJwtAuthMiddleware(options: JwtAuthOptions): Middleware {
  const algo = options.algorithm ?? "HS256";

  return async (req: ApiRequest, next: () => Promise<ApiResponse>) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Unauthorized", "Missing or malformed Authorization header");
    }

    const token = authHeader.slice(7);
    const parts = token.split(".");
    if (parts.length !== 3) {
      return jsonError(401, "Unauthorized", "Malformed JWT token");
    }

    const [headerB64, payloadB64, signature] = parts as [string, string, string];

    try {
      const valid = await hmacVerify(`${headerB64}.${payloadB64}`, signature, options.secret, algo);
      if (!valid) {
        return jsonError(401, "Unauthorized", "Invalid JWT signature");
      }

      const payload = JSON.parse(base64UrlDecode(payloadB64)) as {
        sub?: string;
        exp?: number;
        scopes?: string[];
      };

      if (payload.exp !== undefined && payload.exp < Date.now() / 1000) {
        return jsonError(401, "Unauthorized", "JWT token expired");
      }

      req.user = {
        id: payload.sub ?? "unknown",
        scopes: payload.scopes ?? [],
        type: "jwt",
      };

      return next();
    } catch {
      return jsonError(401, "Unauthorized", "Invalid JWT token");
    }
  };
}

export function createApiKeyAuthMiddleware(options: ApiKeyAuthOptions): Middleware {
  const headerName = options.headerName ?? "x-api-key";

  return async (req: ApiRequest, next: () => Promise<ApiResponse>) => {
    const key = req.headers[headerName] ?? "";
    if (!key) {
      return jsonError(401, "Unauthorized", `Missing ${headerName} header`);
    }

    if (!options.validKeys.has(key)) {
      return jsonError(401, "Unauthorized", "Invalid API key");
    }

    req.user = {
      id: `api-key:${key.slice(0, 8)}`,
      scopes: ["read", "write"],
      type: "api-key",
    };

    return next();
  };
}

export function createCompositeAuthMiddleware(
  jwtOptions: JwtAuthOptions,
  apiKeyOptions: ApiKeyAuthOptions,
): Middleware {
  const jwtMw = createJwtAuthMiddleware(jwtOptions);
  const apiKeyMw = createApiKeyAuthMiddleware(apiKeyOptions);

  return async (req: ApiRequest, next: () => Promise<ApiResponse>) => {
    const authHeader = req.headers["authorization"] ?? "";
    const apiKeyHeader = req.headers[apiKeyOptions.headerName ?? "x-api-key"] ?? "";

    if (authHeader.startsWith("Bearer ")) {
      return jwtMw(req, next);
    }
    if (apiKeyHeader) {
      return apiKeyMw(req, next);
    }

    return jsonError(401, "Unauthorized", "Provide either Authorization Bearer token or API key");
  };
}
