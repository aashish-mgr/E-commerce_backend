import { OAuth2Client } from "google-auth-library";
import { envConfig } from "./env";

export const oauth2client = new OAuth2Client({
    clientId: envConfig.GOOGLE_CLIENT_ID,
    clientSecret: envConfig.GOOGLE_CLIENT_SECRET,
    redirectUri: envConfig.GOOGLE_REDIRECT_URL
})


const scopes = [
    "openid",
    "email",
    "profile"
]

export const getGoogleAuthUrl = () => {
     return oauth2client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent"
    });
}