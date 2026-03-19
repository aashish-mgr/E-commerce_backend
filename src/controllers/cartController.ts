import Cart from "../model/cartModel";
import { Request,Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { error } from "node:console";
import Product from "../model/productModel";

class cartController {
    async addToCart (req:AuthRequest,res:Response) {
        const {quantity, productId} = req.body;
        const userId = req.user?.id;

        if(!quantity || !productId) {
            return res.status(400).json({
                message: "Please provide all the details"
            })
        }

        const cartItem = await Cart.findOne({
            where: {userId,productId}
        })

        if(cartItem) {
            cartItem.quantity += quantity;
            await cartItem.save();
            return res.status(200).json({
                message: "quantity added successfully"
            })
        }
        await Cart.create({quantity,productId,userId});
           return res.status(200).json({
            message: "Added to cart successfully"
            })
        

    }

    async getMyCarts (req:AuthRequest,res:Response) {
        const userId = req.user?.id;

        const cartItems = await Cart.findAll({
            where: {userId},
            include: [
                {
                    model: Product
                }
            ]
        })

        if(cartItems.length === 0 ){
            return res.status(400).json({
                message: "no cart items to show"
            })
        }

        return res.status(200).json({
            message: "cart items successfully fetched",
            data: cartItems
        })
    }

    async deleteCartItem(req:Request,res:Response) {
        const {cartId} = req.params;
        if(!cartId) {
            return res.status(400).json({
                message: "Please provide cart id"
            })
        }
        const cartItem = await Cart.findOne({where: {id: cartId}});
        if(!cartItem) {
            return res.status(400).json({
                message: "Cart Item not found"
            })
        }

        await Cart.destroy({where: {id: cartId}});

        return res.status(200).json({
            message: "Cart item successfully deleted"
        })
    }
}

export default new cartController();