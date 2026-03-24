import * as dotenv from 'dotenv';
dotenv.config();

import { Sequelize } from 'sequelize-typescript';
import User from '../model/userModel'
import Product from '../model/productModel';
import Category from '../model/categoryModel';
import Cart from '../model/cartModel';
import { applyRelationship } from '../model';
import Order from '../model/orderModel';
import OrderDetail from '../model/orderDetailModel';
import Payment from '../model/paymentModel';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
}

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    models: [User, Product,Category,Cart,Order,OrderDetail,Payment],
    logging: console.log,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

const connectDb = async () => {
    try {
    await sequelize.authenticate();
    console.log("connection has been established successfully")
    applyRelationship();
    await sequelize.sync({alter: true,force: false});
    console.log("sequelize sync completed")
    User;
    }
    catch(err){
        console.error("Database connection or sync error: ",err);
       
    }
}

export  {sequelize,connectDb} 
