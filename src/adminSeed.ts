import User from "./model/userModel"
import bcrypt from 'bcryptjs'
const adminSeeder = async () => {
    try { 
        const existingUser =await User.findOne({where: {userEmail: process.env.ADMIN_EMAIL }});
    if(existingUser) {
        return
    }
    await User.create({
        userName: "admin",
        userEmail: process.env.ADMIN_EMAIL,
        userPassword: bcrypt.hashSync(process.env.ADMIN_PASSWORD as string,10),
        userRole: "vendor"
    })
    console.log("Admin seeded successfully");
}
catch(err) {
    console.log(err);
}
   
}

export {adminSeeder}