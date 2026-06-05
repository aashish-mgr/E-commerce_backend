import { Request,Response } from "express";
import User from "../model/userModel";
import bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { AuthRequest } from "../middlewares/authMiddleware";

class AuthController {
   public static async registerUser(req:Request,res:Response) {
          const {userName,userEmail,userPassword} = req.body;
           if(!userName || !userEmail || !userPassword) {
        return res.status(400).json({
            message: "provide all the details"
        })
    }

    const existingUser = await User.findOne({where: {userEmail}});
    if(existingUser) {
        return res.status(400).json({
            message: "User already exists"
        })
    }

    await User.create({userName,userEmail,userPassword: bcrypt.hashSync(userPassword,10)});
    
    return res.status(200).json({
        message: "user registered successfully"
    })
    }

    public static async loginUser(req:Request,res:Response) {
        const {userEmail,userPassword} = req.body;
     if(!userEmail || !userPassword) {
        return res.status(400).json({
            message: "provide all the details"
        })
    }

    const user = await User.findOne({where: {userEmail}});

    if(!user) {
        return res.status(400).json({
            message: "user not found"
        })
    }

    const isPasswordValid = bcrypt.compareSync(userPassword,user.userPassword);
  
    if(!isPasswordValid) {
        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    const token = jwt.sign({id: user.id},process.env.JWT_SECRET_KEY as string,{
        expiresIn: '20d'
    });

    res.cookie('accessToken' ,token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    })

    return res.status(200).json({
        data: user,
        message: "user logged in succesaly"
    })
    }
    public static async getUserProfile(req:AuthRequest,res:Response) {
        const userId = req.user?.id;
        const user = await User.findByPk(userId);
        if(!user) {
            return res.status(400).json({
                message: "user not found"
            })
        }
        return res.status(200).json({
            data: user,
            message: "user profile fetched successfully"
        })
    }

    public static async  logoutUser(req:AuthRequest,res:Response) {
        res.clearCookie('accessToken');
        return res.status(200).json({
            message: "user logged out successfully"
        })
    }

    
}

export default AuthController;