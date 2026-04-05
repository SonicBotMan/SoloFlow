import { SignJWT, jwtVerify } from "jose";
import type { User, UserId, AuthConfig, ApiKey, ApiKeyId } from "./types";
import { asUserId, asApiKeyId } from "./types";

const DEFAULT_CONFIG: AuthConfig = {
  jwtSecret: "soloflow-default-secret-change-me",
  jwtIssuer: "soloflow",
  jwtExpiresIn: "24h",
  apiKeyBytes: 32,
};

export class AuthService {
  private readonly config: AuthConfig;
  private readonly secret: Uint8Array;
  private readonly apiKeys = new Map<string, ApiKey>();
  private readonly users = new Map<UserId, User>();

  constructor(config?: Partial<AuthConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.secret = new TextEncoder().encode(this.config.jwtSecret);
  }

  async createToken(user: User): Promise<string> {
    this.users.set(user.id, user);

    return new SignJWT({
      sub: user.id as string,
      tenant: user.tenantId as string,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(this.config.jwtIssuer)
      .setSubject(user.id as string)
      .setIssuedAt()
      .setExpirationTime(this.config.jwtExpiresIn)
      .sign(this.secret);
  }

  async authenticate(token: string): Promise<User> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.config.jwtIssuer,
    });

    const userId = asUserId(payload.sub ?? "");
    const user = this.users.get(userId);
    if (!user) throw new AuthError("User not found after token validation");
    if (!user.active) throw new AuthError("User account is deactivated");

    return user;
  }

  async generateApiKey(user: User, name: string, expiresInDays = 90): Promise<{ id: ApiKeyId; key: string }> {
    const rawBytes = new Uint8Array(this.config.apiKeyBytes);
    crypto.getRandomValues(rawBytes);
    const key = `sf_${bufferToHex(rawBytes)}`;
    const keyHash = await hashSha256(key);

    const id = asApiKeyId(crypto.randomUUID());
    const apiKey: ApiKey = {
      id,
      userId: user.id,
      tenantId: user.tenantId,
      name,
      keyHash,
      createdAt: Date.now(),
      expiresAt: expiresInDays > 0 ? Date.now() + expiresInDays * 86_400_000 : null,
      active: true,
    };

    this.apiKeys.set(keyHash, apiKey);
    return { id, key };
  }

  async validateApiKey(key: string): Promise<User> {
    if (!key.startsWith("sf_")) throw new AuthError("Invalid API key format");

    const keyHash = await hashSha256(key);
    const apiKey = this.apiKeys.get(keyHash);
    if (!apiKey) throw new AuthError("API key not found");
    if (!apiKey.active) throw new AuthError("API key is deactivated");
    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) throw new AuthError("API key has expired");

    const user = this.users.get(apiKey.userId);
    if (!user) throw new AuthError("User associated with API key not found");
    if (!user.active) throw new AuthError("User account is deactivated");

    return user;
  }

  revokeApiKey(keyId: ApiKeyId): void {
    for (const [hash, apiKey] of this.apiKeys) {
      if (apiKey.id === keyId) {
        this.apiKeys.set(hash, { ...apiKey, active: false });
        return;
      }
    }
  }

  getUser(id: UserId): User | undefined {
    return this.users.get(id);
  }

  upsertUser(user: User): void {
    this.users.set(user.id, user);
  }

  removeUser(id: UserId): void {
    this.users.delete(id);
  }

  listApiKeys(userId: UserId): ApiKey[] {
    return [...this.apiKeys.values()].filter((k) => k.userId === userId);
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function bufferToHex(buffer: Uint8Array): string {
  return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashSha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(new Uint8Array(hash));
}
