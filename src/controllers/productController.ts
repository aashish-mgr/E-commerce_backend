import { Response, Request } from "express";
import Product from "../model/productModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import User from "../model/userModel";
import Category from "../model/categoryModel";
import cloudinary from "../config/cloudinary";

function uploadToCloudinary(buffer: Buffer, mimetype: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const b64 = buffer.toString("base64");
    const dataURI = `data:${mimetype};base64,${b64}`;
    cloudinary.uploader.upload(
      dataURI,
      { folder: "ecommerce" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result!.secure_url);
      },
    );
  });
}

class productController {
  public static async createProduct(req: AuthRequest, res: Response) {
    const { productName, productDescription, productPrice, categoryId } =
      req.body;
    if (!productName || !productDescription || !productPrice || !categoryId) {
      return res.status(400).json({
        message: "Please provide all the details",
      });
    }

    let imagePath: string | null = null;
    if (req.file) {
      imagePath = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    }

    const userId = req.user?.id;

    const product = await Product.create({
      productName,
      productDescription,
      productPrice,
      userId,
      categoryId,
      image: imagePath,
    });

    return res.status(200).json({
      data: product,
      message: "product added successfully",
    });
  }

  public static async getProducts(req: Request, res: Response) {
    const products = await Product.findAll({
      include: [
        {
          model: User,
          attributes: ["userName", "userEmail"],
        },
        {
          model: Category,
          attributes: ["categoryName"],
        },
      ],
    });

    if (!products) {
      return res.status(400).json({
        message: "no products found",
      });
    }

    return res.status(200).json({
      data: products,
      message: "products fetched successfully",
    });
  }

  public static async getMyProducts(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const products = await Product.findAll({
      where: { userId },
      include: [
        {
          model: Category,
          attributes: ["id", "categoryName"],
        },
      ],
    });

    return res.status(200).json({
      data: products,
      message: "products fetched successfully",
    });
  }

  public static async getSingleProduct(req: Request, res: Response) {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        message: "id is required",
      });
    }

    const product = await Product.findOne({
      where: { id },
      include: [
        {
          model: User,
          attributes: ["userName", "userEmail"],
        },
        {
          model: Category,
          attributes: ["categoryName"],
        },
      ],
    });

    if (!product) {
      return res.status(400).json({
        message: "product not found",
      });
    }

    return res.status(200).json({
      data: product,
      message: "product fetched successfully",
    });
  }

  public static async updateProduct(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { productName, productDescription, productPrice, categoryId } =
      req.body;
    const file = req?.file;
    const updateData: Record<string, unknown> = {
      productName,
      productDescription,
      productPrice,
      categoryId,
    };
    if (file) {
      updateData.image = await uploadToCloudinary(file.buffer, file.mimetype);
    }

    const product = await Product.findOne({ where: { id } });

    if (!product) {
      return res.status(400).json({
        message: "product not found",
      });
    }

    if (product.userId !== req.user?.id) {
      return res.status(403).json({
        message: "You are not allowed to modify this product",
      });
    }

    await Product.update(updateData, { where: { id } });

    const updatedProduct = await Product.findOne({
      where: { id },
      include: [
        {
          model: User,
          attributes: ["userName", "userEmail"],
        },
        {
          model: Category,
          attributes: ["categoryName"],
        },
      ],
    });

    return res.status(200).json({
      data: updatedProduct,
      message: "product updated successfully",
    });
  }

  public static async deleteProduct(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const product = await Product.findOne({ where: { id } });

    if (!product) {
      return res.status(400).json({
        message: "product not found",
      });
    }

    if (product.userId !== req.user?.id) {
      return res.status(403).json({
        message: "You are not allowed to delete this product",
      });
    }

    await Product.destroy({ where: { id } });

    return res.status(200).json({
      message: "product deleted successfully",
    });
  }
}

export default productController;
