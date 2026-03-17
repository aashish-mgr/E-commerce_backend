import { Response,Request } from "express";
import Product from "../model/productModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import User from "../model/userModel";
import Category from "../model/categoryModel";

class productController {

  public static async createProduct  (req:AuthRequest, res:Response) {
  const { productName, productDescription, productPrice, categoryId } =
    req.body;
  if (
    !productName ||
    !productDescription ||
    !productPrice ||
    !categoryId
  ) {
    return res.status(400).json({
      message: "Please provide all the details",
    });
  }
   
  const userId = req.user?.id

  const product = await Product.create({
    productName,
    productDescription,
    productPrice,
    userId,
    categoryId
  });

  return res.status(200).json({
    data: product,
    message: "product added successfully",
  });
};

public static async getProducts (req:Request, res:Response)  {
  const products = await Product.findAll({
    include: [
      {
        model: User,
        attributes: ['userName','userEmail']
      },
      {
        model: Category,
        attributes: ['categoryName']
      }
    ]
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
};

public static async getSingleProduct (req:Request, res:Response) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({
      message: "id is required",
    });
  }

  const product = await Product.findOne({where: {id},
  include: [
    {
      model: User,
      attributes: ['userName', 'userEmail']
    },
    {
      model: Category,
      attributes: ['categoryName']
    }
  ]});

  if (!product) {
    return res.status(400).json({
      message: "product not found",
    });
  }

  return res.status(200).json({
    data: product,
    message: "product fetched successfully",
  });
};

public static async updateProduct  (req:Request, res:Response) {
  const { id } = req.params;
  const { productName, productDescription, productPrice, productCategory } =
    req.body;

  const product = await Product.findOne({where: {id}});

  if (!product) {
    return res.status(400).json({
      message: "product not found",
    });
  }

  await Product.update(
    { productName, productDescription, productPrice, productCategory },
    { where: { id } },
  );

  const updatedProduct = await Product.findOne({where: {id},
  include: [
    {
      model: User,
      attributes: ['userName','userEmail']
    },
    {
      model: Category,
      attributes: ["categoryName"]
    }
  ]});

  return res.status(200).json({
    data: updatedProduct,
    message: "product updated successfully",
  });
};

public static async deleteProduct  (req:Request, res:Response) {
  const { id } = req.params;

  const product = await Product.findOne({where: {id}});

  if (!product) {
    return res.status(400).json({
      message: "product not found",
    });
  }

  await Product.destroy({ where: { id } });

  return res.status(200).json({
    message: "product deleted successfully",
  });
};

}

export default productController;