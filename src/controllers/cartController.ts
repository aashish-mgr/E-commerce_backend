import Cart from "../model/cartModel";
import { Request,Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { error } from "node:console";
import Product from "../model/productModel";
import Category from "../model/categoryModel";

class cartController {
    // Guard against absurd line quantities. The cart holds what the customer
    // intends to buy, so it should never be able to request more units than
    // exist for sale.
    static readonly MAX_CART_QUANTITY = 100;

    async addToCart (req:AuthRequest,res:Response) {
        const {quantity, productId} = req.body;
        const userId = req.user?.id;

        if(!productId) {
            return res.status(400).json({
                message: "Please provide all the details"
            })
        }

        // Number("abc") is NaN, and the old truthiness check let it through
        // because "abc" is truthy and not < 1. NaN then reached the INTEGER
        // column and postgres rejected the insert with a 500. Number.isInteger
        // rejects NaN, Infinity and fractions in one test, and the value is
        // parsed rather than trusted so nothing non-numeric gets that far.
        const parsedQuantity = Number(quantity);

        if(!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
            return res.status(400).json({
                message: "Quantity must be a whole number of at least 1"
            })
        }

        if(parsedQuantity > cartController.MAX_CART_QUANTITY) {
            return res.status(400).json({
                message: `Quantity cannot be more than ${cartController.MAX_CART_QUANTITY}`
            })
        }

        const product = await Product.findByPk(productId);
        if(!product) {
            return res.status(400).json({
                message: "Product not found"
            })
        }

        const cartItem = await Cart.findOne({
            where: {userId,productId}
        })

        // Adding to an existing line is additive, so the ceiling has to be
        // checked against the resulting total rather than the incoming delta.
        const resultingQuantity = (cartItem?.quantity ?? 0) + parsedQuantity;

        if(resultingQuantity > product.stock) {
            return res.status(400).json({
                message: `Only ${product.stock} left in stock`
            })
        }

        if(cartItem) {
            cartItem.quantity = resultingQuantity;
            await cartItem.save();
            return res.status(200).json({
                message: "quantity added successfully"
            })
        }
        const cart = await Cart.create({quantity: parsedQuantity,productId,userId});
           return res.status(200).json({
            data: cart,
            message: "Added to cart successfully"
            })


    }

    async getMyCarts (req:AuthRequest,res:Response) {
        const userId = req.user?.id;

        const cartItems = await Cart.findAll({
            where: {userId},
            include: [
                {
                    model: Product,
                    include: [Category]
                }
            ]
        })

        if(cartItems.length === 0 ){
            return res.status(200).json({
                message: "no cart items to show",
                data: []
            })
        }

        return res.status(200).json({
            message: "cart items successfully fetched",
            data: cartItems
        })
    }

    async deleteCartItem(req:AuthRequest,res:Response) {
        const {cartId} = req.params;
        const userId = req.user?.id;
        if(!cartId) {
            return res.status(400).json({
                message: "Please provide cart id"
            })
        }
        const cartItem = await Cart.findOne({where: {id: cartId, userId}});
        if(!cartItem) {
            return res.status(400).json({
                message: "Cart Item not found"
            })
        }

        await Cart.destroy({where: {id: cartId, userId}});

        return res.status(200).json({
            message: "Cart item successfully deleted"
        })
    }
}

export default new cartController();