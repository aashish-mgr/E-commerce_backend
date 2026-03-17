import express from 'express';
import {connectDb} from './config/dbConfig'
import userRoute from './routes/userRoute'
import productRoute from './routes/productRoute'
import categoryRoute from './routes/categoryRoute'
import { adminSeeder } from './adminSeed';
import CategoryController from './controllers/categoryController';
import cartRoute from './routes/cartRoute'
import * as dotenv from 'dotenv'

dotenv.config();

const app = express();

connectDb();

app.use(express.json());

adminSeeder();
CategoryController.categorySeeder();

app.use('/auth',userRoute);
app.use('/product',productRoute);
app.use('/category',categoryRoute);
app.use('/cart',cartRoute)

app.listen(3000,() => {
    console.log("sever is listening on port 3000");
})

