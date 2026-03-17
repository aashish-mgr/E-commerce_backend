import Category from "../model/categoryModel";
import { Request,Response } from "express";
class CategoryController {
  categoryData = [
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

  async categorySeeder() {
    const datas = await Category.findAll();
    if (datas.length === 0) {
      const data = await Category.bulkCreate(this.categoryData);
      console.log("Category seeded successfully");
    } else {
      console.log("Category already seeded");
    }
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
