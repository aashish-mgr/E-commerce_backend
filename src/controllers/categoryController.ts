import Category from "../model/categoryModel";
import { Request,Response } from "express";

const defaultCategories = [
  {
    categoryName: "Electronics",
  },
  {
    categoryName: "Grocery",
  },
  {
    categoryName: "Clothing",
  },
  {
    categoryName: "Food/Beverages",
  },
  {
    categoryName: "Utensils",
  },
];

const seedCategories = async () => {
  for (const category of defaultCategories) {
    const [data, created] = await Category.findOrCreate({
      where: { categoryName: category.categoryName },
      defaults: category,
    });
    if (created) {
      console.log(`Category "${data.categoryName}" seeded successfully`);
    }
  }
};

class CategoryController {
  async categorySeeder() {
    await seedCategories();
  }

  async seedCategory(_req: Request,res: Response) {
    await seedCategories();
    return res.status(200).json({
      message: "categories seeded successfully",
    });
  }

  async createCategory(req: Request,res: Response) {
      const {categoryName} = req.body;
      if(!categoryName) {
        return res.status(400).json({
            message: "Please provide all the details"
        })
      }

      await Category.create({categoryName});
      res.status(200).json({
        message: "new category successfully created"
      })
  }

  async getAllCategory(req:Request,res:Response) {
      const data = await Category.findAll();
      if(!data) {
        return res.status(400).json({
            message: "no categories to show"
        })
      }

      res.status(200).json({
        message: "categories fetched successfully",
        data
      })
  }
  async deleteCategory(req:Request,res:Response) {
       const {categoryId} = req.params 
       if(!categoryId) {
        return res.status(400).json({
            message: "category id is required"
        })
       }

       const data = await Category.findOne({where: {id: categoryId}});
       if(!data) {
        return res.status(400).json({
            message: "couldn't find the category"
        })
       }

       await Category.destroy({where: {id: categoryId}});
       res.status(200).json({
        message: "Category successfully deleted"
       })
  }

  async updateCategory(req:Request,res:Response) {
       const {categoryId} = req.params;
       const {categoryName} = req.body;
       if(!categoryId) {
        return res.status(400).json({
            message: "category id is required"
        })
       }

       const data = await Category.findOne({where: {id: categoryId}});
       if(!data) {
        return res.status(400).json({
            message: "couldn't find the category"
        })
       }

      await Category.update({categoryName},{
        where: {id: categoryId}
      });

      const updatedData = await Category.findOne({where: {id: categoryId}})

      return res.status(200).json({
        message: "Category successfully updated",
        updatedData
      })


  }

}

export default new CategoryController();
