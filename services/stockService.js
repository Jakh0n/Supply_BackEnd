const mongoose = require("mongoose");
const InventorySetting = require("../models/InventorySetting");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");

class InventoryError extends Error {
  constructor(message, statusCode = 400, code = "INVENTORY_ERROR", details) {
    super(message);
    this.name = "InventoryError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function getProductId(productRef) {
  if (!productRef) return null;
  if (typeof productRef === "string") return productRef;
  if (productRef._id) return String(productRef._id);
  return String(productRef);
}

function aggregateItems(items, direction) {
  const totals = new Map();
  for (const item of items || []) {
    const productId = getProductId(item.product);
    const quantity = Number(item.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new InventoryError(
        "Every inventory item needs a valid product and quantity",
      );
    }
    totals.set(productId, (totals.get(productId) || 0) + quantity * direction);
  }
  return [...totals.entries()]
    .map(([productId, delta]) => ({ productId, delta }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

function getTransitionDirection(
  previousStatus,
  nextStatus,
  inventoryApplied,
  inventoryStatus,
) {
  if (
    previousStatus !== inventoryStatus &&
    nextStatus === inventoryStatus &&
    !inventoryApplied
  ) {
    return -1;
  }
  if (
    previousStatus === inventoryStatus &&
    nextStatus !== inventoryStatus &&
    inventoryApplied
  ) {
    return 1;
  }
  return 0;
}

function calculateBalance(balanceBefore, delta, product = {}) {
  const balanceAfter = Number(balanceBefore) + Number(delta);
  if (!Number.isFinite(balanceAfter)) {
    throw new InventoryError("Stock balance must be a valid number");
  }
  if (balanceAfter < 0) {
    throw new InventoryError(
      `Insufficient stock for ${product.name || "product"}`,
      409,
      "INSUFFICIENT_STOCK",
      {
        productId: product._id ? String(product._id) : undefined,
        productName: product.name,
        available: Number(balanceBefore),
        required: Math.abs(Number(delta)),
        unit: product.unit,
      },
    );
  }
  return balanceAfter;
}

async function runInTransaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function isInventoryActive(session) {
  const setting = await InventorySetting.findOne({ key: "global" })
    .session(session)
    .lean();
  return setting?.status === "active";
}

async function applyDeltas({
  entries,
  type,
  sourceType,
  sourceId,
  sourceVersion,
  branch,
  reason,
  createdBy,
  session,
  syncAvailability = true,
}) {
  for (const { productId, delta } of entries) {
    const idempotencyKey = `${sourceType}:${sourceId}:${sourceVersion}:${productId}`;
    const existingMovement = await StockMovement.findOne({ idempotencyKey })
      .session(session)
      .lean();
    if (existingMovement) continue;

    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw new InventoryError("Product not found", 404, "PRODUCT_NOT_FOUND", {
        productId,
      });
    }

    const balanceBefore = Number(product.amount || 0);
    const balanceAfter = calculateBalance(balanceBefore, delta, product);

    product.amount = balanceAfter;
    if (syncAvailability) {
      if (balanceAfter === 0) product.isActive = false;
      if (delta > 0) product.isActive = true;
    }
    await product.save({ session });

    await StockMovement.create(
      [
        {
          product: product._id,
          productName: product.name,
          unit: product.unit,
          type,
          quantity: Math.abs(delta),
          delta,
          balanceBefore,
          balanceAfter,
          sourceType,
          sourceId,
          sourceVersion,
          idempotencyKey,
          branch: branch || "main",
          reason,
          createdBy,
        },
      ],
      { session },
    );
  }
}

async function applyOrderTransition({
  order,
  sourceType,
  nextStatus,
  userId,
  session,
  inventoryActive,
}) {
  if (!inventoryActive) return false;
  const previousStatus = order.status;
  const direction = getTransitionDirection(
    previousStatus,
    nextStatus,
    order.inventoryApplied,
    "completed",
  );
  if (direction === 0) return false;

  const sourceVersion = Number(order.inventoryVersion || 0) + 1;
  const isCompleting = direction === -1;
  const type = isCompleting
    ? sourceType === "DrinkOrder"
      ? "drink-order-out"
      : "order-out"
    : "reversal-in";

  await applyDeltas({
    entries: aggregateItems(order.items, direction),
    type,
    sourceType,
    sourceId: order._id,
    sourceVersion,
    branch: order.branch,
    reason: isCompleting
      ? `${sourceType} completed`
      : `${sourceType} completion reversed`,
    createdBy: userId,
    session,
  });

  order.inventoryApplied = isCompleting;
  order.inventoryVersion = sourceVersion;
  return true;
}

async function transitionOrderStatus({
  Model,
  sourceType,
  orderId,
  nextStatus,
  userId,
  adminNotes,
}) {
  return runInTransaction(async (session) => {
    const order = await Model.findById(orderId).session(session);
    if (!order) {
      throw new InventoryError(
        `${sourceType} not found`,
        404,
        "ORDER_NOT_FOUND",
      );
    }

    const inventoryActive = await isInventoryActive(session);
    await applyOrderTransition({
      order,
      sourceType,
      nextStatus,
      userId,
      session,
      inventoryActive,
    });
    order.status = nextStatus;
    if (adminNotes !== undefined) order.adminNotes = adminNotes;
    order.processedBy = userId;
    order.processedAt = new Date();
    await order.save({ session });
    return order._id;
  });
}

async function transitionManyOrderStatuses({
  Model,
  sourceType,
  filter,
  nextStatus,
  userId,
  adminNotes,
}) {
  return runInTransaction(async (session) => {
    const orders = await Model.find(filter).session(session);
    const inventoryActive = await isInventoryActive(session);
    let updatedCount = 0;

    for (const order of orders) {
      const statusChanged = order.status !== nextStatus;
      await applyOrderTransition({
        order,
        sourceType,
        nextStatus,
        userId,
        session,
        inventoryActive,
      });
      order.status = nextStatus;
      if (adminNotes !== undefined) order.adminNotes = adminNotes;
      order.processedBy = userId;
      order.processedAt = new Date();
      await order.save({ session });
      if (statusChanged) updatedCount += 1;
    }

    return {
      ids: orders.map((order) => order._id),
      matchedCount: orders.length,
      updatedCount,
    };
  });
}

async function applyPurchaseTransition({
  purchase,
  previousStatus,
  nextStatus,
  userId,
  session,
}) {
  if (!(await isInventoryActive(session))) return false;
  const transitionDirection = getTransitionDirection(
    previousStatus,
    nextStatus,
    purchase.inventoryApplied,
    "received",
  );
  if (transitionDirection === 0) return false;
  if (!purchase.product) {
    throw new InventoryError(
      "Purchase must be linked to a product before it can affect inventory",
      409,
      "PURCHASE_PRODUCT_REQUIRED",
    );
  }

  const sourceVersion = Number(purchase.inventoryVersion || 0) + 1;
  const isReceiving = transitionDirection === -1;
  const delta = Number(purchase.quantity) * (isReceiving ? 1 : -1);
  await applyDeltas({
    entries: [{ productId: String(purchase.product), delta }],
    type: isReceiving ? "purchase-in" : "reversal-out",
    sourceType: "ProductPurchase",
    sourceId: purchase._id,
    sourceVersion,
    branch: purchase.branch,
    reason: isReceiving ? "Purchase received" : "Purchase receipt reversed",
    createdBy: userId,
    session,
  });

  purchase.inventoryApplied = isReceiving;
  purchase.inventoryVersion = sourceVersion;
  return true;
}

async function createManualMovement({
  productId,
  mode,
  quantity,
  targetBalance,
  reason,
  userId,
}) {
  await runInTransaction(async (session) => {
    const sourceId = new mongoose.Types.ObjectId();
    const inventoryActive = await isInventoryActive(session);
    let delta;
    let type;
    let productToInitialize;

    if (mode === "set") {
      productToInitialize = await Product.findById(productId).session(session);
      if (!productToInitialize) {
        throw new InventoryError("Product not found", 404, "PRODUCT_NOT_FOUND");
      }
      delta =
        Number(targetBalance) - Number(productToInitialize.amount || 0);
      if (delta === 0) {
        if (productToInitialize.inventoryInitialized) {
          throw new InventoryError(
            "Target balance already matches current stock",
          );
        }
        productToInitialize.inventoryInitialized = true;
        productToInitialize.inventoryInitializedAt = new Date();
        productToInitialize.inventoryInitializedBy = userId;
        if (inventoryActive) {
          productToInitialize.isActive = Number(targetBalance) > 0;
        }
        await productToInitialize.save({ session });
        return;
      }
      type = delta > 0 ? "adjustment-in" : "adjustment-out";
    } else {
      const parsedQuantity = Number(quantity);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        throw new InventoryError("Quantity must be a positive number");
      }
      delta = mode === "in" ? parsedQuantity : -parsedQuantity;
      type = mode === "in" ? "manual-in" : "manual-out";
    }

    await applyDeltas({
      entries: [{ productId, delta }],
      type,
      sourceType: "Manual",
      sourceId,
      sourceVersion: 1,
      branch: "main",
      reason,
      createdBy: userId,
      session,
      syncAvailability: inventoryActive,
    });

    if (mode === "set") {
      const initializedProduct = await Product.findById(productId).session(
        session,
      );
      initializedProduct.inventoryInitialized = true;
      initializedProduct.inventoryInitializedAt = new Date();
      initializedProduct.inventoryInitializedBy = userId;
      await initializedProduct.save({ session });
    }
  });
  return Product.findById(productId);
}

async function addStock(productId, quantity, options = {}) {
  return createManualMovement({
    productId,
    mode: "in",
    quantity,
    reason: options.reason || "Manual stock receipt",
    userId: options.userId,
  });
}

module.exports = {
  InventoryError,
  addStock,
  aggregateItems,
  applyPurchaseTransition,
  calculateBalance,
  createManualMovement,
  getTransitionDirection,
  isInventoryActive,
  runInTransaction,
  transitionManyOrderStatuses,
  transitionOrderStatus,
};
