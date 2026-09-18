const express = require("express");
const { body, validationResult } = require("express-validator");
const ProductPurchase = require("../models/ProductPurchase");
const Product = require("../models/Product");
const {
  authenticate,
  requireAdmin,
  requireAdminOrEditor,
} = require("../middleware/auth");
const {
  InventoryError,
  applyPurchaseTransition,
  runInTransaction,
} = require("../services/stockService");
const { escapeRegex } = require("../utils/escapeRegex");
const {
  cloudinary,
  upload,
  uploadToCloudinary,
} = require("../config/cloudinary");
const router = express.Router();

const sendPurchaseError = (res, error, fallbackMessage) => {
  if (error instanceof InventoryError) {
    return res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      details: error.details,
    });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
};

// Create a new product purchase
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("productId").isMongoId().withMessage("Valid product ID is required"),
    body("quantity")
      .isFloat({ gt: 0 })
      .withMessage("Quantity must be positive"),
    body("price").isFloat({ gt: 0 }).withMessage("Price must be positive"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        productId,
        date,
        category,
        productName,
        price,
        providerName,
        paymentWay,
        quantity,
        unit,
        notes,
        branch,
        images,
      } = req.body;

      // Validate required fields
      const requiredFields = [
        "category",
        "productName",
        "price",
        "providerName",
        "paymentWay",
        "quantity",
        "unit",
        "branch",
      ];
      const missingFields = requiredFields.filter((field) => !req.body[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: "Missing required fields",
          missingFields,
        });
      }

      // Calculate total amount
      const calculatedPrice = parseFloat(price);
      const calculatedQuantity = Number(quantity);
      const totalAmount = calculatedPrice * calculatedQuantity;
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (product.unit !== unit) {
        return res.status(400).json({
          message: `Purchase unit must match the product unit (${product.unit})`,
        });
      }

      const productPurchase = new ProductPurchase({
        product: product._id,
        date: date ? new Date(date) : new Date(),
        category,
        productName,
        price: calculatedPrice,
        providerName,
        paymentWay,
        quantity: calculatedQuantity,
        unit,
        totalAmount,
        notes,
        branch,
        images: images || [],
        createdBy: req.user._id,
      });

      await productPurchase.save();

      // Populate the createdBy field for response
      await productPurchase.populate("createdBy", "username");

      res.status(201).json({
        message: "Product purchase created successfully",
        data: productPurchase,
      });
    } catch (error) {
      console.error("Error creating product purchase:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        errors: error.errors,
      });
      if (error.name === "ValidationError") {
        const validationErrors = Object.keys(error.errors).map((key) => ({
          field: key,
          message: error.errors[key].message,
        }));
        return res.status(400).json({
          message: "Validation error",
          errors: validationErrors,
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// Get all product purchases with filtering and pagination
router.get("/", authenticate, async (req, res) => {
  try {
    // Only admin can view purchase requests
    if (req.user.position !== "admin") {
      return res.status(403).json({
        message:
          "Access denied. Only administrators can view purchase requests.",
      });
    }

    const {
      page = 1,
      limit = 20,
      category,
      branch,
      status,
      paymentWay,
      startDate,
      endDate,
      search,
    } = req.query;

    // Build filter object
    const filter = {};

    if (category && category !== "all") {
      filter.category = category;
    }

    if (branch && branch !== "all") {
      filter.branch = branch;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (paymentWay && paymentWay !== "all") {
      filter.paymentWay = paymentWay;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    // Search filter
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { productName: { $regex: safe, $options: "i" } },
        { providerName: { $regex: safe, $options: "i" } },
        { notes: { $regex: safe, $options: "i" } },
      ];
    }

    // Calculate pagination
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const listQuery = ProductPurchase.find(filter)
      .populate("createdBy", "username")
      .populate("product", "name unit category amount")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const [purchases, total] = await Promise.all([
      listQuery.exec(),
      ProductPurchase.countDocuments(filter),
    ]);

    res.json({
      data: {
        purchases,
        pagination: {
          current: pageNum,
          pages: Math.ceil(total / limitNum),
          total,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching product purchases:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get a single product purchase by ID
router.get("/:id", authenticate, async (req, res) => {
  try {
    // Only admin can view purchase requests
    if (req.user.position !== "admin") {
      return res.status(403).json({
        message:
          "Access denied. Only administrators can view purchase requests.",
      });
    }

    const purchase = await ProductPurchase.findById(req.params.id).populate(
      "createdBy",
      "username",
    ).populate("product", "name unit category amount");

    if (!purchase) {
      return res.status(404).json({ message: "Product purchase not found" });
    }

    res.json({ data: purchase });
  } catch (error) {
    console.error("Error fetching product purchase:", error);
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Product purchase not found" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update a product purchase
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  [
    body("productId").optional().isMongoId().withMessage("Invalid product ID"),
    body("quantity").optional().isFloat({ gt: 0 }),
    body("status")
      .optional()
      .isIn(["pending", "ordered", "received", "cancelled"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      await runInTransaction(async (session) => {
        const purchase = await ProductPurchase.findById(req.params.id).session(
          session,
        );
        if (!purchase) {
          throw new InventoryError(
            "Product purchase not found",
            404,
            "PURCHASE_NOT_FOUND",
          );
        }

        const previousStatus = purchase.status;
        const nextStatus = req.body.status ?? previousStatus;
        const changesReceivedInventory =
          previousStatus === "received" &&
          nextStatus === "received" &&
          ["productId", "quantity", "unit"].some(
            (field) => req.body[field] !== undefined,
          );
        if (changesReceivedInventory) {
          throw new InventoryError(
            "Reverse the received status before changing product, quantity, or unit",
            409,
            "RECEIVED_PURCHASE_LOCKED",
          );
        }

        if (previousStatus === "received" && nextStatus !== "received") {
          await applyPurchaseTransition({
            purchase,
            previousStatus,
            nextStatus,
            userId: req.user._id,
            session,
          });
        }

        const fieldMap = {
          date: "date",
          category: "category",
          productName: "productName",
          price: "price",
          providerName: "providerName",
          paymentWay: "paymentWay",
          quantity: "quantity",
          unit: "unit",
          notes: "notes",
          branch: "branch",
          images: "images",
        };
        for (const [requestField, modelField] of Object.entries(fieldMap)) {
          if (req.body[requestField] !== undefined) {
            purchase[modelField] = req.body[requestField];
          }
        }

        if (req.body.productId !== undefined) {
          const product = await Product.findById(req.body.productId).session(
            session,
          );
          if (!product) {
            throw new InventoryError(
              "Product not found",
              404,
              "PRODUCT_NOT_FOUND",
            );
          }
          purchase.product = product._id;
        }

        purchase.status = nextStatus;
        if (previousStatus !== "received" && nextStatus === "received") {
          await applyPurchaseTransition({
            purchase,
            previousStatus,
            nextStatus,
            userId: req.user._id,
            session,
          });
        }
        await purchase.save({ session });
      });

      const purchase = await ProductPurchase.findById(req.params.id)
        .populate("createdBy", "username")
        .populate("product", "name unit category amount");
      return res.json({
        message: "Product purchase updated successfully",
        data: purchase,
      });
    } catch (error) {
      if (error.name === "ValidationError") {
        const validationErrors = Object.keys(error.errors).map((key) => ({
          field: key,
          message: error.errors[key].message,
        }));
        return res.status(400).json({
          message: "Validation error",
          errors: validationErrors,
        });
      }
      return sendPurchaseError(res, error, "Error updating product purchase");
    }
  },
);

// Delete a product purchase
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const purchase = await ProductPurchase.findById(req.params.id);

    if (!purchase) {
      return res.status(404).json({ message: "Product purchase not found" });
    }
    if (purchase.inventoryApplied) {
      return res.status(409).json({
        message:
          "Reverse the received status before deleting this purchase record",
        code: "RECEIVED_PURCHASE_LOCKED",
      });
    }

    await purchase.deleteOne();

    res.json({ message: "Product purchase deleted successfully" });
  } catch (error) {
    console.error("Error deleting product purchase:", error);
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Product purchase not found" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get purchase statistics
router.get("/stats/summary", authenticate, async (req, res) => {
  try {
    // Only admin can view stats
    if (req.user.position !== "admin") {
      return res.status(403).json({
        message:
          "Access denied. Only administrators can view purchase statistics.",
      });
    }

    const { startDate, endDate, branch } = req.query;

    // Build filter for date range
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        dateFilter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.date.$lte = new Date(endDate);
      }
    }

    // Add branch filter if specified
    if (branch && branch !== "all") {
      dateFilter.branch = branch;
    }

    // Get statistics
    const [
      totalPurchases,
      totalAmount,
      statusBreakdown,
      categoryBreakdown,
      recentPurchases,
    ] = await Promise.all([
      ProductPurchase.countDocuments(dateFilter),
      ProductPurchase.aggregate([
        { $match: dateFilter },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      ProductPurchase.aggregate([
        { $match: dateFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ProductPurchase.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      ProductPurchase.find(dateFilter)
        .populate("createdBy", "username")
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    res.json({
      data: {
        totalPurchases,
        totalAmount: totalAmount[0]?.total || 0,
        statusBreakdown,
        categoryBreakdown,
        recentPurchases,
      },
    });
  } catch (error) {
    console.error("Error fetching purchase statistics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Upload images to Cloudinary (admin only)
router.post(
  "/upload-images",
  authenticate,
  upload.array("images", 5), // Allow up to 5 images
  async (req, res) => {
    try {
      // Only admin can upload images
      if (req.user.position !== "admin") {
        return res.status(403).json({
          message: "Access denied. Only administrators can upload images.",
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No images provided" });
      }

      // Upload each file to Cloudinary
      const uploadPromises = req.files.map(async (file) => {
        const result = await uploadToCloudinary(file.buffer);
        return {
          url: result.secure_url,
          publicId: result.public_id,
          isPrimary: false,
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);

      // Set first image as primary by default
      if (uploadedImages.length > 0) {
        uploadedImages[0].isPrimary = true;
      }

      res.json({
        message: "Images uploaded successfully",
        images: uploadedImages,
      });
    } catch (error) {
      console.error("Error uploading images:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

module.exports = router;
