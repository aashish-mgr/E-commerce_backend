
import { Sequelize } from 'sequelize-typescript';
import User from '../model/userModel'
import Product from '../model/productModel';
import Category from '../model/categoryModel';
import Cart from '../model/cartModel';
import { applyRelationship } from '../model';
import Order from '../model/orderModel';
import OrderDetail from '../model/orderDetailModel';
import Payment from '../model/paymentModel';
import RefreshToken from '../model/refreshTokenModel';
import { envConfig } from './env';

const DATABASE_URL = envConfig.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
}

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    models: [User, Product,Category,Cart,Order,OrderDetail,Payment,RefreshToken],
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
    await sequelize.sync({alter: false,force: false});
    await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" VARCHAR(255)');
    await sequelize.query('ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 100');
    await sequelize.query(`DO $$
      BEGIN
        ALTER TYPE "enum_users_userRole" ADD VALUE IF NOT EXISTS 'admin';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;`);
    // totalAmount was FLOAT (a double) and is now DECIMAL(12,2). sequelize.sync
    // runs with alter: false, so it will not migrate the existing column and any
    // value already stored would stay a float and keep drifting on read. Rounding
    // through numeric clamps whatever is already there to the two decimal places
    // the column now declares.
    await sequelize.query(
      'ALTER TABLE "orders" ALTER COLUMN "totalAmount" TYPE DECIMAL(12,2) USING "totalAmount"::numeric(12,2)',
    );
    console.log("sequelize sync completed")
    User;
    }
    catch(err){
        console.error("Database connection or sync error: ",err);
       
    }
}

export  {sequelize,connectDb} 
