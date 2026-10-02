import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { envConfig } from "./env";

const scopes = [
    "openid",
    "email",
    "profile"
]

/**
 * Builds a client for the caller to use for the length of one request.
 *
 * This used to be a module-level singleton that every concurrent callback
 * shared. `setCredentials` writes to the instance, so two callbacks overlapping
 * in time raced on one credential slot: whichever finished last decided what
 * the other's `verifyIdToken` and any later call saw. Sign-ins could then be
 * attributed to the wrong account. A client is a small config object, so making
 * one per request costs nothing and removes the shared mutable state entirely.
 */
export const createOAuth2Client = (): OAuth2Client => new OAuth2Client({
    clientId: envConfig.GOOGLE_CLIENT_ID,
    clientSecret: envConfig.GOOGLE_CLIENT_SECRET,
    redirectUri: envConfig.GOOGLE_REDIRECT_URL
})

type AuthUrlOptions = {
    /** Anti-CSRF nonce; see utils/oauthState.ts. */
    state: string;
    /** PKCE challenge derived from the verifier held in the state cookie. */
    codeChallenge?: string | undefined;
}

export const getGoogleAuthUrl = ({
    state,
    codeChallenge,
}: AuthUrlOptions): string =>
    createOAuth2Client().generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent",
        // Without state the callback cannot tell its own request from an
        // attacker-supplied one, which is login CSRF. Google echoes it back
        // unchanged, and the callback rejects anything it did not issue.
        state,
        ...(codeChallenge
            ? {
                code_challenge: codeChallenge,
                code_challenge_method: CodeChallengeMethod.S256,
            }
            : {}),
    });