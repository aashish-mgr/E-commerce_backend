import dotenv from "dotenv"
import {z} from 'zod'

dotenv.config();

const schema = z.object({
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET_KEY: z.string().min(1, "JWT_SECRET_KEY is required"),
    CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
    CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
    CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
    ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email address"),
    ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
    GOOGLE_CLIENT_ID: z.string().min(1,"GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1,"GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URL: z.string().url("GOOGLE_REDIRECT_URL must be a valid URL"),
    // Auth cookies carry session credentials, so the Secure flag is not
    // optional in production. Leaving this unset follows NODE_ENV, which is
    // the safe default and needs no extra configuration. Set it explicitly
    // only when the transport disagrees with NODE_ENV, e.g. an HTTPS staging
    // host still running NODE_ENV=development.
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    // Where the browser is sent once a sign-in finishes, and the only origin
    // allowed to make credentialed API calls. Absolute by construction: a
    // relative value would strand the user on the API origin. Accepts a
    // comma-separated list so staging and production can share one variable.
    // The schema check is a plain string because the per-origin validation
    // happens in clientOrigins below.
    CLIENT_URL: z.string().min(1).default("http://localhost:5173"),
    // Port to bind. Defaults to 3000, but hosts such as Render, Railway and Fly
    // assign one at runtime and inject it as PORT, so this must never be
    // hardcoded in app.ts.
    PORT: z.coerce.number().int().positive().default(3000),
    // Khalti gateway. The test and live APIs are different hosts serving the
    // same paths, so the whole base is one variable rather than a flag.
    KHALTI_API_BASE: z
        .string()
        .url("KHALTI_API_BASE must be a valid URL")
        .optional(),
    // How the Postgres connection is secured. Named after libpq's sslmode so it
    // reads the same as the connection string it overrides:
    //   disable     - no TLS. Local development against a local socket.
    //   require     - TLS negotiated, but the server certificate is not
    //                 verified. This defeats passive eavesdropping and nothing
    //                 else: an active attacker still terminates the connection
    //                 and reads or rewrites every row, password hashes and
    //                 refresh tokens included. Only for a server whose
    //                 certificate cannot be validated.
    //   verify-full - TLS with full certificate and hostname validation. The
    //                 only setting that is safe in production.
    // Unset follows NODE_ENV: verify-full in production, disable elsewhere.
    DB_SSL_MODE: z.enum(["disable", "require", "verify-full"]).optional(),
    // PEM bundle for a private CA, for when the server presents a certificate
    // the system trust store does not already contain.
    DB_SSL_CA: z.string().min(1).optional(),
    KHALTI_SECRET_KEY: z.string().min(1, "KHALTI_SECRET_KEY is required"),
    ACCESS_TOKEN_EXPIRES_IN: z.string().optional(),
    REFRESH_TOKEN_EXPIRES_IN: z.string().optional(),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    // Bounds how long startup waits on the cache. Without it the initial
    // connect retries forever and the API never starts listening.
    REDIS_CONNECT_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(3000),
    // Redis is a cache, so it is optional by default. Set to "true" in
    // deployments where serving stale-free data is not worth a degraded cache.
    REDIS_REQUIRED: z
        .string()
        .optional()
        .transform((value) => value === "true"),
    // Sequelize interpolates bound values into the statement it logs, so a query
    // log is a record of every password hash, email and token that passed
    // through. Off by default rather than on outside production, because the
    // sensitive thing here is the values and not the deployment.
    DB_LOG_QUERIES: z
        .string()
        .optional()
        .transform((value) => value === "true"),
    // A slow query is worth reporting on its own even when full logging is off.
    DB_SLOW_QUERY_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(500),
})

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.format());
    throw new Error("Invalid environment variables");
}

// A query log is a transcript of every password hash, email and token that
// passed through the database, so there is no safe way to leave it on in
// production. Warned about in dbConfig.ts as well; this is the fail-closed
// half, because a warning in a log nobody reads is not a control.
if (parsed.data.NODE_ENV === "production" && parsed.data.DB_LOG_QUERIES) {
    console.error(
        "DB_LOG_QUERIES is enabled in production. It records password hashes, " +
            "emails and tokens in the query log. Refusing to start.",
    );
    throw new Error("Unsafe production configuration");
}

// Each configured origin is validated on its own, and trailing slashes are
// stripped: a browser sends Origin without one, so "https://app.example.com/"
// and "https://app.example.com" have to compare equal or the CORS check
// rejects the real site.
const clientOrigins = parsed.data.CLIENT_URL.split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

for (const origin of clientOrigins) {
    const valid = z.string().url().safeParse(origin);
    if (!valid.success) {
        console.error(`CLIENT_URL contains an invalid origin: "${origin}"`);
        throw new Error("Invalid environment variables");
    }
}

if (clientOrigins.length === 0) {
    console.error("CLIENT_URL must list at least one origin");
    throw new Error("Invalid environment variables");
}

// A localhost origin in production never fails at boot. The service starts, the
// storefront loads, CORS admits nothing, and the OAuth return trip sends the
// browser to http://localhost:5173, where it finds nothing. Refusing to start
// points at the actual mistake instead, and follows the same fail-closed
// reasoning as the DB_LOG_QUERIES check above.
const isLoopbackHost = (host: string): boolean =>
    host === "localhost" || host === "127.0.0.1" || host === "::1";

const loopbackOrigins = clientOrigins.filter((origin) => {
    try {
        return isLoopbackHost(new URL(origin).hostname);
    } catch {
        // Already rejected by the per-origin url() check above.
        return false;
    }
});

if (parsed.data.NODE_ENV === "production" && loopbackOrigins.length > 0) {
    console.error(
        `CLIENT_URL points at localhost in production: ${loopbackOrigins.join(", ")}. ` +
            "Browsers cannot reach it, so CORS and the OAuth return trip both fail. " +
            "Set it to the deployed frontend origin."
    );
    throw new Error("Invalid environment variables");
}

// Parsing cannot fail here: every client origin passed z.string().url() above.
if (
    parsed.data.NODE_ENV === "production" &&
    isLoopbackHost(new URL(parsed.data.GOOGLE_REDIRECT_URL).hostname)
) {
    console.error(
        `GOOGLE_REDIRECT_URL points at localhost in production: ` +
            `${parsed.data.GOOGLE_REDIRECT_URL}. Google sends the browser there after ` +
            "sign-in, where no API is listening. Set it to this service's own callback " +
            "URL, and register that exact URL as an authorised redirect URI in Google Cloud."
    );
    throw new Error("Invalid environment variables");
}

// Fail closed: an unset COOKIE_SECURE must never silently mean "no Secure
// flag" in production, where a cookie set over plaintext HTTP is exposed to
// anyone on the path. NODE_ENV is the proxy for the deployment's transport
// because req.secure cannot tell the truth behind a TLS-terminating proxy.
const cookieSecure =
    parsed.data.COOKIE_SECURE === undefined
        ? parsed.data.NODE_ENV === "production"
        : parsed.data.COOKIE_SECURE === "true";

// Same fail-closed reasoning as the cookie flag: a production database reached
// over the network must not fall back to an unverified or plaintext link
// because nobody set a variable.
const dbSslMode =
    parsed.data.DB_SSL_MODE ??
    (parsed.data.NODE_ENV === "production" ? "verify-full" : "disable");

// Live by default in production so a missing variable cannot quietly leave the
// site on the test gateway and hand real payments to a sandbox.
const khaltiApiBase = (
    parsed.data.KHALTI_API_BASE ??
    (parsed.data.NODE_ENV === "production"
        ? "https://web-api.khalti.com/api/v2"
        : "https://dev.khalti.com/api/v2")
).replace(/\/+$/, "");

export const envConfig = {
    NODE_ENV: parsed.data.NODE_ENV,
    DATABASE_URL: parsed.data.DATABASE_URL,
    JWT_SECRET_KEY: parsed.data.JWT_SECRET_KEY,
    CLOUDINARY_CLOUD_NAME: parsed.data.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: parsed.data.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: parsed.data.CLOUDINARY_API_SECRET,
    ADMIN_EMAIL: parsed.data.ADMIN_EMAIL,
    ADMIN_PASSWORD: parsed.data.ADMIN_PASSWORD,
    GOOGLE_CLIENT_ID: parsed.data.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: parsed.data.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URL: parsed.data.GOOGLE_REDIRECT_URL,
    COOKIE_SECURE: cookieSecure,
    CLIENT_URL: clientOrigins[0],
    CLIENT_ORIGINS: clientOrigins,
    PORT: parsed.data.PORT,
    DB_SSL_MODE: dbSslMode,
    DB_SSL_CA: parsed.data.DB_SSL_CA,
    KHALTI_SECRET_KEY: parsed.data.KHALTI_SECRET_KEY,
    KHALTI_API_BASE: khaltiApiBase,
    ACCESS_TOKEN_EXPIRES_IN: parsed.data.ACCESS_TOKEN_EXPIRES_IN ?? '15m',
    REFRESH_TOKEN_EXPIRES_IN: parsed.data.REFRESH_TOKEN_EXPIRES_IN ?? '20d',
    REDIS_URL: parsed.data.REDIS_URL,
    REDIS_CONNECT_TIMEOUT_MS: parsed.data.REDIS_CONNECT_TIMEOUT_MS,
    REDIS_REQUIRED: parsed.data.REDIS_REQUIRED,
    DB_LOG_QUERIES: parsed.data.DB_LOG_QUERIES,
    DB_SLOW_QUERY_MS: parsed.data.DB_SLOW_QUERY_MS,
}
