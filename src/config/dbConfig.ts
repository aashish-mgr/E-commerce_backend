
import fs from 'fs';
import type { ConnectionOptions } from 'tls';
import { Sequelize } from 'sequelize-typescript';
import User from '../model/userModel'
import Product from '../model/productModel';
import Category from '../model/categoryModel';
import Cart from '../model/cartModel';
import { applyRelationship } from '../model';
import Order from '../model/orderModel';
import OrderDetail from '../model/orderDetailModel';
import Payment from '../model/paymentModel';
import RefreshToken from '../model/refreshTokenModel';
import { envConfig } from './env';

const DATABASE_URL = envConfig.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
}

/**
 * TLS settings for the database connection.
 *
 * This used to be hardcoded to `{require: true, rejectUnauthorized: false}`,
 * which is the worst of both options: it forces TLS onto a local server that
 * does not offer it, and then disables certificate verification on the remote
 * ones that do. With verification off, any host on the path can answer the
 * handshake with a certificate it made up, and then read or rewrite every row.
 * That includes the users table and the refresh_tokens table, so a MITM on the
 * database connection is equivalent to full account takeover.
 *
 * Verification is on by default in production, and pg sends the connect host as
 * TLS servername (see pg/lib/connection.js), so verify-full validates the
 * hostname too rather than just the signature chain.
 */
const buildSslOptions = (): (ConnectionOptions & { require: boolean }) | undefined => {
    if (envConfig.DB_SSL_MODE === 'disable') {
        return undefined;
    }

    const ssl: ConnectionOptions & { require: boolean } = {
        // node-postgres's switch for "negotiate TLS and fail if the server
        // refuses". It says nothing about whether the certificate is genuine.
        require: true,
        // Only the explicitly opted-in require mode skips validation.
        rejectUnauthorized: envConfig.DB_SSL_MODE === 'verify-full',
    };

    if (envConfig.DB_SSL_CA) {
        ssl.ca = fs.readFileSync(envConfig.DB_SSL_CA, 'utf8');
    }

    return ssl;
};

const sslOptions = buildSslOptions();

// Reaching for require mode in production is a choice with a real cost, so it
// is reported at startup rather than left to be discovered during an incident.
if (envConfig.NODE_ENV === 'production' && sslOptions?.rejectUnauthorized === false) {
    console.warn(
        'DB_SSL_MODE=require in production: the database certificate is not verified. ' +
        'A man-in-the-middle can read and modify every row, including password hashes ' +
        'and refresh tokens. Use verify-full, and set DB_SSL_CA if the server uses a private CA.'
    );
}

/**
 * Query logging.
 *
 * This was `logging: console.log`, which prints every statement on every boot
 * with its bound values already interpolated into the SQL. That puts password
 * hashes, email addresses and refresh tokens in stdout, and in production means
 * those records land in whatever collects the logs.
 *
 * Sequelize hands the logger the interpolated statement plus the duration, so
 * the useful signal and the sensitive one arrive together. Full logging is now
 * opt-in via DB_LOG_QUERIES for local debugging, and slow queries are reported
 * on their own so production keeps a performance signal without a continuous
 * record of every value in the database.
 */
const createQueryLogger = () => {
  return (message: string, timing?: number) => {
    if (typeof timing === "number" && timing >= envConfig.DB_SLOW_QUERY_MS) {
      console.warn(
        `[db] slow query (${timing}ms, threshold ${envConfig.DB_SLOW_QUERY_MS}ms): ${message}`
      );
      return;
    }

    if (envConfig.DB_LOG_QUERIES) {
      console.log(`[db] ${message}`);
    }
  };
};

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    models: [User, Product,Category,Cart,Order,OrderDetail,Payment,RefreshToken],
    logging: createQueryLogger(),
    // Omitted entirely in disable mode rather than passed as undefined, so no
    // TLS option reaches pg that could contradict the configured mode.
    ...(sslOptions ? { dialectOptions: { ssl: sslOptions } } : {}),
});

const connectDb = async () => {
    try {
    await sequelize.authenticate();
    console.log("connection has been established successfully")
    applyRelationship();
    await sequelize.sync({alter: false,force: false});
    await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" VARCHAR(255)');
    await sequelize.query('ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 100');
    await sequelize.query(`DO $$
      BEGIN
        ALTER TYPE "enum_users_userRole" ADD VALUE IF NOT EXISTS 'admin';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;`);
    // totalAmount was FLOAT (a double) and is now DECIMAL(12,2). sequelize.sync
    // runs with alter: false, so it will not migrate the existing column and any
    // value already stored would stay a float and keep drifting on read. Rounding
    // through numeric clamps whatever is already there to the two decimal places
    // the column now declares.
    await sequelize.query(
      'ALTER TABLE "orders" ALTER COLUMN "totalAmount" TYPE DECIMAL(12,2) USING "totalAmount"::numeric(12,2)',
    );
    console.log("sequelize sync completed")
    User;
    }
    catch(err){
        console.error("Database connection or sync error: ",err);

        // A rejected certificate is a configuration problem, not a transient
        // one, and the OpenSSL text on its own does not say which knob to turn.
        // The API keeps serving after this, so the hint is the only thing that
        // stands between an operator and a deploy that looks healthy while
        // every query fails.
        if (
            envConfig.DB_SSL_MODE !== 'disable' &&
            /certificate|self[- ]signed|unable to verify/i.test(
                err instanceof Error ? err.message : String(err)
            )
        ) {
            console.error(
                `Database TLS verification failed with DB_SSL_MODE=${envConfig.DB_SSL_MODE}. ` +
                'Supabase\' pooled connections (port 6543) are signed by a private CA that is in ' +
                'no public trust store, so verify-full needs that root: download it from the project\'s ' +
                'database settings and point DB_SSL_CA at the file. DB_SSL_MODE=require will connect, ' +
                'but it does not verify who is on the other end of the connection.'
            );
        }
    }
}

export  {sequelize,connectDb} 
