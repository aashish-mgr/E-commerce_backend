import dotenv from "dotenv"
import {z} from 'zod'

dotenv.config();

const schema = z.object({
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
    KHALTI_SECRET_KEY: z.string().min(1, "KHALTI_SECRET_KEY is required"),
    ACCESS_TOKEN_EXPIRES_IN: z.string().optional(),
    REFRESH_TOKEN_EXPIRES_IN: z.string().optional(),
})

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.format());
    throw new Error("Invalid environment variables");
}

export const envConfig = {
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
    KHALTI_SECRET_KEY: parsed.data.KHALTI_SECRET_KEY,
    ACCESS_TOKEN_EXPIRES_IN: parsed.data.ACCESS_TOKEN_EXPIRES_IN ?? '15m',
    REFRESH_TOKEN_EXPIRES_IN: parsed.data.REFRESH_TOKEN_EXPIRES_IN ?? '20d',
}