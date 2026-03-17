"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = exports.sequelize = void 0;
const sequelize_typescript_1 = require("sequelize-typescript");
const userModel_1 = __importDefault(require("../model/userModel"));
const DATABASE_URL = "postgresql://postgres.inhqwzklaesjxhmxwylz:Ash09848881278@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
const sequelize = new sequelize_typescript_1.Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: console.log,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});
exports.sequelize = sequelize;
const connectDb = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield sequelize.authenticate();
        console.log("connection has been established successfully");
        yield sequelize.sync({ alter: true, force: true });
        console.log("sequelize sync completed");
        userModel_1.default;
    }
    catch (err) {
        console.error("Database connection or sync error: ", err);
    }
});
exports.connectDb = connectDb;
//# sourceMappingURL=dbConfig.js.map