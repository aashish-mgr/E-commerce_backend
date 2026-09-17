import express from 'express';
import {connectDb} from './config/dbConfig'
import userRoute from './routes/userRoute'
import productRoute from './routes/productRoute'
import categoryRoute from './routes/categoryRoute'
import { adminSeeder } from './adminSeed';
import CategoryController from './controllers/categoryController';
import cartRoute from './routes/cartRoute'
import orderRoute from './routes/orderRoute'
import { notFound, errorHandler } from './middlewares/errorHandler';
import * as dotenv from 'dotenv'
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { generalLimiter,authLimiter } from './middlewares/rateLimiter';


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

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "src/uploads"))
);
app.use('/auth',authLimiter,userRoute);
app.use('/product',generalLimiter,productRoute);
app.use('/category',generalLimiter,categoryRoute);
app.use('/cart',generalLimiter,cartRoute);
app.use('/order',generalLimiter,orderRoute);

app.use(notFound);
app.use(errorHandler);


app.listen(3000,() => {
    console.log("sever is listening on port 3000");
})

