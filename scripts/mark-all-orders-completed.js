/**
 * One-off script: set all orders and drink orders to status "completed".
 * Usage: node scripts/mark-all-orders-completed.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Order = require("../models/Order");
const DrinkOrder = require("../models/DrinkOrder");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const now = new Date();
  const update = {
    $set: {
      status: "completed",
      processedAt: now,
    },
  };

  const [ordersBefore, drinkBefore] = await Promise.all([
    Order.countDocuments({ status: { $ne: "completed" } }),
    DrinkOrder.countDocuments({ status: { $ne: "completed" } }),
  ]);

  const [orderResult, drinkResult] = await Promise.all([
    Order.updateMany({}, update),
    DrinkOrder.updateMany({}, update),
  ]);

  console.log(
    "Orders updated:",
    orderResult.modifiedCount,
    `(non-completed before: ${ordersBefore})`,
  );
  console.log(
    "Drink orders updated:",
    drinkResult.modifiedCount,
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
