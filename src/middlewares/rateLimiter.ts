import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit(({
    windowMs: 15 * 60 *1000,
    limit: 30,
    message: {
        message: "Too many request.Please try again later."
    }
}))

export const authLimiter = rateLimit({
    windowMs: 15*60*1000,
    limit: 7,
    message: {
        message: "Too many requests.Please try again later."
    }
})