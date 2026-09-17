import { Response, Request } from "express";
import Product from "../model/productModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import User from "../model/userModel";
import Category from "../model/categoryModel";
import { getPaginationMeta,getPaginationParams } from "../utils/pagination";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import { Op } from "sequelize";

class productController {
  public static async createProduct(req: AuthRequest, res: Response) {
    const { productName, productDescription, productPrice, categoryId, stock } =
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

    const parsedStock = Math.max(0, Math.floor(Number(stock) || 0));

    const product = await Product.create({
      productName,
      productDescription,
      productPrice,
      userId,
      categoryId,
      image: imagePath,
      stock: parsedStock,
    });

    return res.status(200).json({
      data: product,
      message: "product added successfully",
    });
  }

  public static async getProducts(req: Request, res: Response) {
    
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const search = typeof req.query.search === "string" ? req.query.search : "";
    const categoryId =
      typeof req.query.categoryId === "string" ? req.query.categoryId : "";

    const where: Record<string | symbol, unknown> = {};

    if (search) {
      where[Op.or] = [
        { productName: { [Op.iLike]: `%${search}%` } },
        { productDescription: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await Product.findAll({
      where,
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
      order: [["createdAt", "DESC"]],
      limit,
      offset: skip,
    });

    const total = await Product.count({ where });

    const pagination = getPaginationMeta(page,limit,total)

    return res.status(200).json({
      data: products,
      message: "products fetched successfully",
      pagination
    });
  }

  public static async getMyProducts(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const search = typeof req.query.search === "string" ? req.query.search : "";
    const categoryId =
      typeof req.query.categoryId === "string" ? req.query.categoryId : "";

    const where: Record<string | symbol, unknown> = { userId };

    if (search) {
      where[Op.or] = [
        { productName: { [Op.iLike]: `%${search}%` } },
        { productDescription: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await Product.findAll({
      where,
      include: [
        {
          model: Category,
          attributes: ["id", "categoryName"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset: skip,
    });

    const total = await Product.count({ where });

    const pagination = getPaginationMeta(page,limit,total)

    return res.status(200).json({
      data: products,
      message: "products fetched successfully",
      pagination,
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
    const { productName, productDescription, productPrice, categoryId, stock } =
      req.body;
    const file = req?.file;
    const updateData: Record<string, unknown> = {
      productName,
      productDescription,
      productPrice,
      categoryId,
    };
    if (stock !== undefined && stock !== "") {
      updateData.stock = Math.max(0, Math.floor(Number(stock) || 0));
    }
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
