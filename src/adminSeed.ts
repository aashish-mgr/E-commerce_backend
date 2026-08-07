import User from "./model/userModel"
import bcrypt from 'bcryptjs'
import { envConfig } from "./config/env";
const adminSeeder = async () => {
    try { 
        const existingUser =await User.findOne({where: {userEmail: envConfig.ADMIN_EMAIL }});
    if(existingUser) {
        return
    }
    await User.create({
        userName: "admin",
        userEmail: envConfig.ADMIN_EMAIL,
        userPassword: bcrypt.hashSync(envConfig.ADMIN_PASSWORD as string,10),
        userRole: "vendor"
    })
    console.log("Admin seeded successfully");
}
catch(err) {
    console.log(err);
}
   
}

export {adminSeeder}