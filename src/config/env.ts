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
}