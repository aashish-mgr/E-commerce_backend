import User from "./userModel";
import Category from "./categoryModel";
import Product from "./productModel";
import Cart from './cartModel'


export function applyRelationship () {
User.hasMany(Product,{foreignKey: 'userId'});
Product.belongsTo(User,{foreignKey: 'userId'});

Category.hasMany(Product, {foreignKey: 'categoryId'});
Product.belongsTo(Category, {foreignKey: 'categoryId'});

Product.hasMany(Cart,{foreignKey: 'productId'});
Cart.belongsTo(Product,{foreignKey: 'productId'});

User.hasMany(Cart,{foreignKey: 'userId'});
Cart.belongsTo(User,{foreignKey: 'userId'});

}

