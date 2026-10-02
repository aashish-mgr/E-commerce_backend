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
    // Where the browser is sent once a sign-in finishes. Absolute by
    // construction: a relative value would strand the user on the API origin.
    CLIENT_URL: z
        .string()
        .url("CLIENT_URL must be a valid URL")
        .default("http://localhost:5173"),
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
    CLIENT_URL: parsed.data.CLIENT_URL,
    DB_SSL_MODE: dbSslMode,
    DB_SSL_CA: parsed.data.DB_SSL_CA,
    KHALTI_SECRET_KEY: parsed.data.KHALTI_SECRET_KEY,
    ACCESS_TOKEN_EXPIRES_IN: parsed.data.ACCESS_TOKEN_EXPIRES_IN ?? '15m',
    REFRESH_TOKEN_EXPIRES_IN: parsed.data.REFRESH_TOKEN_EXPIRES_IN ?? '20d',
    REDIS_URL: parsed.data.REDIS_URL,
    REDIS_CONNECT_TIMEOUT_MS: parsed.data.REDIS_CONNECT_TIMEOUT_MS,
    REDIS_REQUIRED: parsed.data.REDIS_REQUIRED,
    DB_LOG_QUERIES: parsed.data.DB_LOG_QUERIES,
    DB_SLOW_QUERY_MS: parsed.data.DB_SLOW_QUERY_MS,
}
