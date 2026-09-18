import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit(({
    windowMs: 5 * 60 *1000,
    limit: 50,
    message: {
        message: "Too many request.Please try again later."
    }
}))

export const authLimiter = rateLimit({
    windowMs: 15*60*1000,
    limit: 100,
    message: {
        message: "Too many requests.Please try again later."
    }
})
export const refreshLimiter = rateLimit({
    windowMs: 10*60*1000,
    limit: 30,
    message: {
        message: "Too many refresh requests. Please try again later."
    }
})
