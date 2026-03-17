"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dbConfig_1 = require("./config/dbConfig");
const app = (0, express_1.default)();
(0, dbConfig_1.connectDb)();
app.use(express_1.default.json());
app.listen(3000, () => {
    console.log("sever is listening on port 3000");
});
//# sourceMappingURL=app.js.map