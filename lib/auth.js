import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Verifies the Google ID token sent as "Authorization: Bearer <token>".
// Returns { sub, email, name } or throws { status }.
export async function requireUser(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw { status: 500, message: "GOOGLE_CLIENT_ID is not set" };
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) throw { status: 401, message: "missing token" };
  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    }));
  } catch {
    throw { status: 401, message: "invalid token" };
  }
  if (!payload.email_verified) throw { status: 401, message: "email not verified" };
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(payload.email).toLowerCase())) {
    throw { status: 403, message: "not on the allow list" };
  }
  return { sub: payload.sub, email: payload.email, name: payload.given_name || payload.name || payload.email };
}
