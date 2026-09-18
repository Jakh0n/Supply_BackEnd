/**
 * One-off script: set all orders and drink orders to status "completed".
 * Usage: node scripts/mark-all-orders-completed.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Order = require("../models/Order");
const DrinkOrder = require("../models/DrinkOrder");
const User = require("../models/User");
const {
  transitionManyOrderStatuses,
} = require("../services/stockService");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const actor = await User.findOne({ position: "admin", isActive: true });
  if (!actor) {
    throw new Error("An active admin user is required to record inventory movements");
  }

  const [ordersBefore, drinkBefore] = await Promise.all([
    Order.countDocuments({ status: { $ne: "completed" } }),
    DrinkOrder.countDocuments({ status: { $ne: "completed" } }),
  ]);

  const orderResult = await transitionManyOrderStatuses({
    Model: Order,
    sourceType: "Order",
    filter: {},
    nextStatus: "completed",
    userId: actor._id,
  });
  const drinkResult = await transitionManyOrderStatuses({
    Model: DrinkOrder,
    sourceType: "DrinkOrder",
    filter: {},
    nextStatus: "completed",
    userId: actor._id,
  });

  console.log(
    "Orders updated:",
    orderResult.updatedCount,
    `(non-completed before: ${ordersBefore})`,
  );
  console.log(
    "Drink orders updated:",
    drinkResult.updatedCount,
    `(non-completed before: ${drinkBefore})`,
  );

  const [ordersAfter, drinkAfter] = await Promise.all([
    Order.countDocuments({ status: "completed" }),
    DrinkOrder.countDocuments({ status: "completed" }),
  ]);

  console.log("Total completed orders:", ordersAfter);
  console.log("Total completed drink orders:", drinkAfter);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
