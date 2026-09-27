import User from "./model/userModel"
import bcrypt from 'bcryptjs'
import { envConfig } from "./config/env";
import { incrementCacheVersion } from "./utils/redisHelper";
import { USER_CACHE_RESOURCE } from "./utils/userCache";
const adminSeeder = async () => {
    try { 
        const existingUser =await User.findOne({where: {userEmail: envConfig.ADMIN_EMAIL }});
    if(existingUser) {
        if (existingUser.userRole !== "admin") {
            await existingUser.update({ userRole: "admin" });
            await incrementCacheVersion(USER_CACHE_RESOURCE);
            console.log("Admin role promoted");
        }
        return
    }
    await User.create({
        userName: "admin",
        userEmail: envConfig.ADMIN_EMAIL,
        userPassword: bcrypt.hashSync(envConfig.ADMIN_PASSWORD as string,10),
        userRole: "admin"
    })
    await incrementCacheVersion(USER_CACHE_RESOURCE);
    console.log("Admin seeded successfully");
}
catch(err) {
    console.log(err);
}
   
}

export {adminSeeder}