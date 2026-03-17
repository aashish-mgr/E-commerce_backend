import User from "./userModel";
import Category from "./categoryModel";
import Product from "./productModel";


export function applyRelationship () {
User.hasMany(Product,{foreignKey: 'userId'});
Product.belongsTo(User,{foreignKey: 'userId'});

Category.hasMany(Product, {foreignKey: 'categoryId'});
Product.belongsTo(Category, {foreignKey: 'categoryId'});

}

