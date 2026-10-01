import { Request, Response } from "express";
import { Op } from "sequelize";
import { AuthRequest } from "../middlewares/authMiddleware";
import { getPaginationMeta, getPaginationParams } from "../utils/pagination";
import { isUuid } from "../utils/isUuid";
import User from "../model/userModel";
import Product from "../model/productModel";
import Category from "../model/categoryModel";
import Cart from "../model/cartModel";
import Order from "../model/orderModel";
import OrderDetail from "../model/orderDetailModel";
import Payment from "../model/paymentModel";
import { incrementCacheVersions, CACHE_TTL, generateCacheKey, getCacheVersion, setOrGetCache } from "../utils/redisHelper";
import { sequelize } from "../config/dbConfig";

const VALID_ROLES = ["admin", "vendor", "customer"];
const LOW_STOCK_THRESHOLD = 5;

// getStats aggregates every table, so any write that changes a count or a
// rollup invalidates it alongside the resource it touched.
const STATS = "admin-stats";

const toSafeUser = (user: User) => ({
  id: user.id,
  userName: user.userName,
  userEmail: user.userEmail,
  userRole: user.userRole,
  googleId: user.googleId,
  provider: user.provider,
  avatar: user.avatar,
  createdAt: (user as any).createdAt,
});

class AdminController {
  async getStats(_req: Request, res: Response) {
    const version = await getCacheVersion(STATS);
    const cacheKey = generateCacheKey(`${STATS}:v${version}`);

    const data = await setOrGetCache(cacheKey, CACHE_TTL.adminStats, async () => {
      const [
        totalUsers,
        totalVendors,
        totalCustomers,
        totalAdmins,
        totalProducts,
        totalOrders,
        totalCategories,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        lowStockProducts,
      ] = await Promise.all([
        User.count(),
        User.count({ where: { userRole: "vendor" } }),
        User.count({ where: { userRole: "customer" } }),
        User.count({ where: { userRole: "admin" } }),
        Product.count(),
        Order.count(),
        Category.count(),
        Order.count({ where: { orderStatus: "pending" } }),
        Order.count({ where: { orderStatus: "delivered" } }),
        Order.count({ where: { orderStatus: "cancelled" } }),
        Product.count({ where: { stock: { [Op.lte]: LOW_STOCK_THRESHOLD } } }),
      ]);

      const totalRevenue =
        (await Order.sum("totalAmount", {
          where: { orderStatus: { [Op.ne]: "cancelled" } },
        })) ?? 0;

      const days = 7;
      const periodStart = new Date();
      periodStart.setHours(0, 0, 0, 0);
      periodStart.setDate(periodStart.getDate() - (days - 1));

      const rangeOrders = await Order.findAll({
        where: {
          createdAt: { [Op.gte]: periodStart },
          orderStatus: { [Op.ne]: "cancelled" },
        },
        attributes: ["createdAt", "totalAmount"],
      });

      const salesTrend = Array.from({ length: days }, (_, i) => {
        const date = new Date(periodStart);
        date.setDate(periodStart.getDate() + i);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return { date: key, revenue: 0, orders: 0 };
      });

      for (const order of rangeOrders) {
        const created = new Date(order.createdAt);
        const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
        const bucket = salesTrend.find((t) => t.date === key);
        if (bucket) {
          bucket.revenue += Number(order.totalAmount) || 0;
          bucket.orders += 1;
        }
      }

      const recentOrders = await Order.findAll({
        include: [
          { model: Payment },
          {
            model: OrderDetail,
            include: [
              {
                model: Product,
                attributes: [
                  "id",
                  "productName",
                  "productPrice",
                  "image",
                  "stock",
                ],
              },
            ],
          },
          { model: User, attributes: ["id", "userName", "userEmail"] },
        ],
        order: [["createdAt", "DESC"]],
        limit: 5,
      });

      const recentUsers = await User.findAll({
        attributes: [
          "id",
          "userName",
          "userEmail",
          "userRole",
          "provider",
          "avatar",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
        limit: 5,
      });

      return {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalAdmins,
        totalProducts,
        totalOrders,
        totalCategories,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        lowStockProducts,
        totalRevenue,
        salesTrend,
        recentOrders,
        recentUsers,
      };
    });

    return res.status(200).json({
      message: "admin stats fetched successfully",
      data,
    });
  }

  async getUsers(req: Request, res: Response) {
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const search =
      typeof req.query.search === "string" ? req.query.search : "";
    const role = typeof req.query.role === "string" ? req.query.role : "";

    const where: Record<string | symbol, unknown> = {};

    if (search) {
      const searchTerm = `%${search}%`;
      where[Op.or] = [
        { userName: { [Op.iLike]: searchTerm } },
        { userEmail: { [Op.iLike]: searchTerm } },
      ];
    }

    if (role && role !== "all") {
      where.userRole = role;
    }

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: [
        "id",
        "userName",
        "userEmail",
        "userRole",
        "provider",
        "avatar",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset: skip,
    });

    return res.status(200).json({
      message: "users fetched successfully",
      data: rows,
      pagination: getPaginationMeta(page, limit, count),
    });
  }

  async updateUserRole(req: AuthRequest, res: Response) {
    const userId = req.params.userId as string;
    const { userRole } = req.body;

    if (!userId || !userRole) {
      return res.status(400).json({
        message: "user id and role are required",
      });
    }

    if (!VALID_ROLES.includes(userRole)) {
      return res.status(400).json({
        message: "invalid role",
      });
    }

    const target = await User.findByPk(userId);
    if (!target) {
      return res.status(400).json({
        message: "user not found",
      });
    }

    if (target.id === req.user?.id && target.userRole !== userRole) {
      return res.status(400).json({
        message: "You cannot change your own role",
      });
    }

    await target.update({ userRole });

    await incrementCacheVersions(["user", STATS]);

    return res.status(200).json({
      message: "user role updated successfully",
      data: toSafeUser(target),
    });
  }

  async deleteUser(req: Request, res: Response) {
    const userId = req.params.userId as string;

    if (!userId) {
      return res.status(400).json({
        message: "user id is required",
      });
    }

    const target = await User.findByPk(userId);
    if (!target) {
      return res.status(400).json({
        message: "user not found",
      });
    }

    if (target.userRole === "admin") {
      return res.status(400).json({
        message: "Admin accounts cannot be deleted",
      });
    }

    try {
      await Cart.destroy({ where: { userId } });
      await target.destroy();
    } catch {
      return res.status(400).json({
        message:
          "Cannot delete this user because they have existing products or orders",
      });
    }

    await incrementCacheVersions(["user", "product", STATS]);

    return res.status(200).json({
      message: "user deleted successfully",
    });
  }

  async getProducts(req: Request, res: Response) {
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const search =
      typeof req.query.search === "string" ? req.query.search : "";
    const categoryId =
      typeof req.query.categoryId === "string" ? req.query.categoryId : "";

    const where: Record<string | symbol, unknown> = {};

    if (search) {
      where[Op.or] = [
        { productName: { [Op.iLike]: `%${search}%` } },
        { productDescription: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Same rows as the public product list but a different projection and
    // order, so it gets its own key - sharing one would hand the wrong shape
    // to one of the two endpoints.
    const version = await getCacheVersion("product");
    const cacheKey = generateCacheKey(`product:admin:v${version}`, {
      page,
      limit,
      search,
      categoryId,
    });

    const products = await setOrGetCache(
      cacheKey,
      CACHE_TTL.productList,
      () =>
        Product.findAndCountAll({
          where,
          include: [
            {
              model: User,
              attributes: ["id", "userName", "userEmail"],
            },
            {
              model: Category,
              attributes: ["id", "categoryName"],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit,
          offset: skip,
        }),
    );

    return res.status(200).json({
      message: "products fetched successfully",
      data: products.rows,
      pagination: getPaginationMeta(page, limit, products.count),
    });
  }

  async updateProductStock(req: AuthRequest, res: Response) {
    const productId = req.params.productId as string;
    const { stock } = req.body;

    if (!productId) {
      return res.status(400).json({
        message: "product id is required",
      });
    }

    if (stock === undefined || isNaN(Number(stock))) {
      return res.status(400).json({
        message: "stock is required",
      });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(400).json({
        message: "product not found",
      });
    }

    await product.update({ stock: Math.max(0, Math.floor(Number(stock))) });

    await incrementCacheVersions(["product", STATS]);

    return res.status(200).json({
      message: "product stock updated successfully",
      data: {
        id: product.id,
        productName: product.productName,
        stock: product.stock,
      },
    });
  }

  async deleteProduct(req: Request, res: Response) {
    const productId = req.params.productId as string;

    if (!productId) {
      return res.status(400).json({
        message: "product id is required",
      });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(400).json({
        message: "product not found",
      });
    }

    try {
      await Cart.destroy({ where: { productId } });
      await product.destroy();
    } catch {
      return res.status(400).json({
        message: "Cannot delete this product because it has existing orders",
      });
    }

    await incrementCacheVersions(["product", STATS]);

    return res.status(200).json({
      message: "product deleted successfully",
    });
  }

  async getOrders(req: Request, res: Response) {
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const status =
      typeof req.query.status === "string" ? req.query.status : "";
    const search =
      typeof req.query.search === "string" ? req.query.search : "";

    const where: Record<string | symbol, unknown> = {};

    if (status && status !== "all") {
      where.orderStatus = status;
    }

    const productOrderIds = search
      ? (
          await OrderDetail.findAll({
            attributes: ["orderId"],
            include: [
              {
                model: Product,
                attributes: [],
                where: {
                  productName: { [Op.iLike]: `%${search}%` },
                },
              },
            ],
          })
        ).map((row) => (row as any).orderId)
      : [];

    if (search) {
      const searchTerm = `%${search}%`;
      const conditions: Record<string, unknown>[] = [
        { phoneNumber: { [Op.iLike]: searchTerm } },
        { shippingAddress: { [Op.iLike]: searchTerm } },
      ];
      // The search box accepts a plain order id, but only a well-formed uuid can
      // be compared against the id column without postgres erroring out.
      if (isUuid(search)) {
        conditions.push({ id: search });
      }
      if (productOrderIds.length > 0) {
        conditions.push({ id: { [Op.in]: productOrderIds } });
      }
      where[Op.or] = conditions;
    }

    const orders = await Order.findAndCountAll({
      where,
      include: [
        { model: Payment },
        {
          model: OrderDetail,
          include: [
            {
              model: Product,
              attributes: [
                "id",
                "productName",
                "productPrice",
                "image",
                "stock",
              ],
            },
          ],
        },
        { model: User, attributes: ["id", "userName", "userEmail"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset: skip,
    });

    return res.status(200).json({
      message: "orders fetched successfully",
      data: orders.rows,
      pagination: getPaginationMeta(page, limit, orders.count),
    });
  }

  async updateOrderStatus(req: Request, res: Response) {
    const orderId = req.params.orderId as string;
    const { orderStatus } = req.body;

    if (!orderId || !orderStatus) {
      return res.status(400).json({
        message: "order id and order status are required",
      });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(400).json({
        message: "order not found",
      });
    }

    await order.update({ orderStatus });

    await incrementCacheVersions(["order", STATS]);

    return res.status(200).json({
      message: "order status successfully updated",
    });
  }

  async updatePaymentStatus(req: Request, res: Response) {
    const orderId = req.params.orderId as string;
    const { paymentStatus } = req.body;

    if (!orderId || !paymentStatus) {
      return res.status(400).json({
        message: "order id and payment status are required",
      });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(400).json({
        message: "order not found",
      });
    }

    const paymentId = (order as any).paymentId;

    await Payment.update(
      { paymentStatus },
      { where: { id: paymentId } },
    );

    await incrementCacheVersions(["order", STATS]);

    return res.status(200).json({
      message: "payment status successfully updated",
    });
  }

  async deleteOrder(req: Request, res: Response) {
    const orderId = req.params.orderId as string;

    if (!orderId) {
      return res.status(400).json({
        message: "order id is required",
      });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(400).json({
        message: "order not found",
      });
    }

    // Deleting the order before its children violates the orderdetails ->
    // orders foreign key and aborts the whole operation, so children go first.
    // Wrapped in a transaction so a failure part-way cannot leave a payment row
    // orphaned against a missing order.
    await sequelize.transaction(async (transaction) => {
      await OrderDetail.destroy({ where: { orderId }, transaction });
      await Payment.destroy({
        where: { id: (order as any).paymentId },
        transaction,
      });
      await Order.destroy({ where: { id: orderId }, transaction });
    });

    await incrementCacheVersions(["order", STATS]);

    return res.status(200).json({
      message: "order successfully deleted",
    });
  }

  async createCategory(req: Request, res: Response) {
    const { categoryName } = req.body;

    if (!categoryName) {
      return res.status(400).json({
        message: "Please provide a category name",
      });
    }

    const [category, created] = await Category.findOrCreate({
      where: { categoryName },
      defaults: { categoryName },
    });

    if (!created) {
      return res.status(400).json({
        message: "Category already exists",
      });
    }

    await incrementCacheVersions(["category", "product", STATS]);

    return res.status(200).json({
      message: "category successfully created",
      data: category,
    });
  }

  async updateCategory(req: Request, res: Response) {
    const categoryId = req.params.categoryId as string;
    const { categoryName } = req.body;

    if (!categoryId || !categoryName) {
      return res.status(400).json({
        message: "category id and category name are required",
      });
    }

    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(400).json({
        message: "category not found",
      });
    }

    await category.update({ categoryName });

    await incrementCacheVersions(["category", "product", STATS]);

    return res.status(200).json({
      message: "category successfully updated",
      updatedData: category,
    });
  }

  async deleteCategory(req: Request, res: Response) {
    const categoryId = req.params.categoryId as string;

    if (!categoryId) {
      return res.status(400).json({
        message: "category id is required",
      });
    }

    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(400).json({
        message: "category not found",
      });
    }

    try {
      await category.destroy();
    } catch {
      return res.status(400).json({
        message: "Cannot delete this category because it has products",
      });
    }

    await incrementCacheVersions(["category", "product", STATS]);

    return res.status(200).json({
      message: "category successfully deleted",
    });
  }
}

export default new AdminController();
