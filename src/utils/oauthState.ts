import crypto from "crypto";
import type { Request, Response } from "express";
import { envConfig } from "../config/env";
import { createOAuth2Client } from "../config/oAuth";
import { baseCookieOptions } from "./tokenUtils";

/**
 * Anti-CSRF state for the OAuth authorization-code flow.
 *
 * Without a `state` parameter the callback accepts any authorization code
 * arriving at it, which is login CSRF: an attacker runs the flow with their own
 * Google account, obtains a callback URL, and gets the victim's browser to open
 * it. The victim silently ends up signed in as the attacker, so anything they
 * later enter (a shipping address, a card) is captured under an account the
 * attacker can read. It is also session fixation, because the attacker's own
 * credentials get attached to the victim's browser.
 *
 * The defence has two halves and both are needed:
 *
 *   1. The state cookie is httpOnly and per-browser, so only the browser that
 *      started the flow holds it. A callback arriving anywhere else has no
 *      cookie to match.
 *   2. The cookie is HMAC-signed with a secret the client cannot read or
 *      forge, so its contents cannot be manufactured by an attacker who
 *      controls the callback request.
 *
 * The signature also makes this self-contained: no server-side session store,
 * and so no dependency on Redis being reachable for Google sign-in to work.
 */
const STATE_COOKIE = "oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * A signing key derived from JWT_SECRET_KEY rather than the secret itself, so a
 * signature produced here can never be replayed as one produced by the token
 * code, or the reverse.
 */
const SIGNING_KEY = crypto
  .createHmac("sha256", envConfig.JWT_SECRET_KEY)
  .update("oauth-state-v1")
  .digest();

type OAuthState = {
  /** Random nonce, sent to the provider as the `state` query parameter. */
  nonce: string;
  /** PKCE verifier. Stays in this cookie; only its challenge is sent out. */
  verifier?: string;
  issuedAt: number;
};

const b64url = (input: string): string =>
  Buffer.from(input).toString("base64url");

const sign = (body: string): string =>
  crypto.createHmac("sha256", SIGNING_KEY).update(body).digest("base64url");

const serialize = (state: OAuthState): string => {
  const body = b64url(JSON.stringify(state));
  return `${body}.${sign(body)}`;
};

/**
 * Parses and authenticates the state cookie. Returns null for anything missing,
 * tampered with, or past its TTL.
 */
const deserialize = (raw: string): OAuthState | null => {
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = raw.slice(0, separator);
  const given = Buffer.from(raw.slice(separator + 1));
  const want = Buffer.from(sign(body));

  // timingSafeEqual throws when the lengths differ, and that mismatch is itself
  // proof the value was not issued here, so it is checked before the compare.
  if (given.length !== want.length) return null;
  if (!crypto.timingSafeEqual(given, want)) return null;

  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof state?.nonce !== "string" || typeof state?.issuedAt !== "number") {
    return null;
  }

  // Age is enforced here as well as by the cookie's Max-Age, because a client
  // is free to ignore the expiry and resend an old cookie.
  if (Date.now() - state.issuedAt > STATE_TTL_MS) return null;

  return state;
};

/**
 * Constant-time nonce comparison. A length mismatch is not secret: the nonce is
 * sent to the provider in the URL, so an attacker already knows its length.
 */
const nonceMatches = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export type IssuedOAuthState = {
  /** Value to pass as the `state` query parameter to the provider. */
  state: string;
  /** PKCE code challenge to send alongside the `state`. */
  codeChallenge?: string | undefined;
};

/**
 * Mints state, binds it to this browser through the state cookie, and returns
 * what the redirect to the provider needs.
 *
 * Each call overwrites the cookie, so only the most recently started sign-in
 * can be completed and starting a new one invalidates any abandoned attempt.
 */
export const issueOAuthState = async (
  res: Response
): Promise<IssuedOAuthState> => {
  const state: OAuthState = {
    nonce: crypto.randomBytes(32).toString("hex"),
    issuedAt: Date.now(),
  };

  // PKCE: the verifier never leaves this cookie, only its S256 challenge is
  // given to the provider, so a captured authorization code is worthless
  // without the cookie issued alongside it.
  const { codeVerifier, codeChallenge } =
    await createOAuth2Client().generateCodeVerifierAsync();

  if (codeChallenge) {
    state.verifier = codeVerifier;
  }

  res.cookie(STATE_COOKIE, serialize(state), {
    ...baseCookieOptions(),
    maxAge: STATE_TTL_MS,
  });

  return { state: state.nonce, codeChallenge };
};

export const clearOAuthStateCookie = (res: Response): void => {
  res.clearCookie(STATE_COOKIE, baseCookieOptions());
};

/**
 * Verifies a callback against the state issued for this browser and consumes
 * it. Returns null on any mismatch, including a callback replayed after the
 * cookie has already been cleared.
 */
export const consumeOAuthState = (
  req: Request,
  res: Response,
  received: unknown
): { codeVerifier?: string | undefined } | null => {
  const raw = req.cookies?.[STATE_COOKIE];
  if (typeof raw !== "string") return null;

  // Cleared unconditionally, before the state is judged. On success this is what
  // makes the nonce single-use; on failure it stops a stale cookie from being
  // retried against a fresh callback.
  clearOAuthStateCookie(res);

  if (typeof received !== "string" || received.length === 0) return null;

  const state = deserialize(raw);
  if (!state) return null;
  if (!nonceMatches(state.nonce, received)) return null;

  return { codeVerifier: state.verifier };
};