import { sequelize } from "../config/dbConfig";

const run = async () => {
  try {
    await sequelize.authenticate();
    console.log("connected");
    await sequelize.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 100',
    );
    console.log("stock column added with default 100");
  } catch (error) {
    console.error("migration failed:", error);
  } finally {
    await sequelize.close();
  }
};

run();