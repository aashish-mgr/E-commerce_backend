import User from "./userModel";
import Category from "./categoryModel";
import Product from "./productModel";
import Cart from './cartModel'
import Order from "./orderModel";
import OrderDetail from "./orderDetailModel";
import Payment from "./paymentModel";


export function applyRelationship () {
User.hasMany(Product,{foreignKey: 'userId'});
Product.belongsTo(User,{foreignKey: 'userId'});

Category.hasMany(Product, {foreignKey: 'categoryId'});
Product.belongsTo(Category, {foreignKey: 'categoryId'});

Product.hasMany(Cart,{foreignKey: 'productId'});
Cart.belongsTo(Product,{foreignKey: 'productId'});

User.hasMany(Cart,{foreignKey: 'userId'});
Cart.belongsTo(User,{foreignKey: 'userId'});

Order.hasMany(OrderDetail,{foreignKey: 'orderId'});
OrderDetail.belongsTo(Order,{foreignKey: 'orderId'});

Product.hasMany(OrderDetail,{foreignKey: 'productId'});
OrderDetail.belongsTo(Product,{foreignKey: 'productId'});

Payment.hasOne(Order,{foreignKey: 'paymentId'});
Order.belongsTo(Payment,{foreignKey: 'paymentId'});

}

