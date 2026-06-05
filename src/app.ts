import express from 'express';
import {connectDb} from './config/dbConfig'
import userRoute from './routes/userRoute'
import productRoute from './routes/productRoute'
import categoryRoute from './routes/categoryRoute'
import { adminSeeder } from './adminSeed';
import CategoryController from './controllers/categoryController';
import cartRoute from './routes/cartRoute'
import orderRoute from './routes/orderRoute'
import * as dotenv from 'dotenv'
import cors from 'cors';
import cookieParser from 'cookie-parser';



dotenv.config();

const app = express();

connectDb();

app.use(express.json());

adminSeeder();
CategoryController.categorySeeder();

app.use (cors( {
    origin: 'http://localhost:5173',
    credentials: true,
}));
app.use(cookieParser());


app.use('/auth',userRoute);
app.use('/product',productRoute);
app.use('/category',categoryRoute);
app.use('/cart',cartRoute);
app.use('/order',orderRoute);

app.listen(3000,() => {
    console.log("sever is listening on port 3000");
})

