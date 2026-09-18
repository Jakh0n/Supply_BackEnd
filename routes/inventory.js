const express = require('express')
const { body, query, validationResult } = require('express-validator')
const InventorySetting = require('../models/InventorySetting')
const Product = require('../models/Product')
const StockMovement = require('../models/StockMovement')
const {
	authenticate,
	requireAdmin,
	requireAdminOrEditor,
} = require('../middleware/auth')
const { escapeRegex } = require('../utils/escapeRegex')
const {
	InventoryError,
	createManualMovement,
	runInTransaction,
} = require('../services/stockService')

const router = express.Router()

router.use(authenticate, requireAdminOrEditor)

const validateRequest = (req, res, next) => {
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(400).json({
			message: 'Validation failed',
			errors: errors.array(),
		})
	}
	return next()
}

const getInventorySetup = async () => {
	const [setting, totalProducts, initializedProducts] = await Promise.all([
		InventorySetting.findOne({ key: 'global' }).lean(),
		Product.countDocuments({}),
		Product.countDocuments({ inventoryInitialized: true }),
	])
	return {
		status: setting?.status || 'setup',
		totalProducts,
		initializedProducts,
		remainingProducts: Math.max(totalProducts - initializedProducts, 0),
		activatedAt: setting?.activatedAt || null,
	}
}

router.get('/settings', async (req, res) => {
	try {
		return res.json({ settings: await getInventorySetup() })
	} catch (error) {
		console.error('Get inventory settings error:', error)
		return res.status(500).json({ message: 'Server error fetching inventory settings' })
	}
})

router.post('/activate', requireAdmin, async (req, res) => {
	try {
		await runInTransaction(async session => {
			const currentSetting = await InventorySetting.findOne({ key: 'global' }).session(
				session
			)
			if (currentSetting?.status === 'active') return

			const totalProducts = await Product.countDocuments({}).session(session)
			if (totalProducts === 0) {
				throw new InventoryError(
					'Add and initialize products before activating inventory control',
					409,
					'NO_INVENTORY_PRODUCTS'
				)
			}

			const uninitializedProducts = await Product.find({
				inventoryInitialized: { $ne: true },
			})
				.select('name')
				.limit(20)
				.session(session)
				.lean()
			const remainingProducts = await Product.countDocuments({
				inventoryInitialized: { $ne: true },
			}).session(session)
			if (remainingProducts > 0) {
				throw new InventoryError(
					'Initialize every product before activating inventory control',
					409,
					'INVENTORY_SETUP_INCOMPLETE',
					{
						remainingProducts,
						products: uninitializedProducts.map(product => product.name),
					}
				)
			}

			await Product.updateMany(
				{ amount: { $gt: 0 } },
				{ $set: { isActive: true } },
				{ session }
			)
			await Product.updateMany(
				{ $or: [{ amount: { $lte: 0 } }, { amount: { $exists: false } }] },
				{ $set: { isActive: false } },
				{ session }
			)
			await InventorySetting.findOneAndUpdate(
				{ key: 'global' },
				{
					$set: {
						status: 'active',
						activatedAt: new Date(),
						activatedBy: req.user._id,
					},
					$setOnInsert: { key: 'global' },
				},
				{ upsert: true, new: true, session }
			)
		})

		return res.json({
			message: 'Inventory control activated successfully',
			settings: await getInventorySetup(),
		})
	} catch (error) {
		if (error instanceof InventoryError) {
			return res.status(error.statusCode).json({
				message: error.message,
				code: error.code,
				details: error.details,
			})
		}
		console.error('Activate inventory error:', error)
		return res.status(500).json({ message: 'Server error activating inventory' })
	}
})

router.get('/summary', async (req, res) => {
	try {
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
		const [
			totalProducts,
			outOfStockProducts,
			lowStockProducts,
			recentMovementCounts,
		] = await Promise.all([
			Product.countDocuments({}),
			Product.countDocuments({ amount: { $lte: 0 } }),
			Product.countDocuments({
				amount: { $gt: 0 },
				minimumStock: { $gt: 0 },
				$expr: { $lte: ['$amount', '$minimumStock'] },
			}),
			StockMovement.aggregate([
				{ $match: { createdAt: { $gte: since } } },
				{
					$group: {
						_id: { $cond: [{ $gt: ['$delta', 0] }, 'incoming', 'outgoing'] },
						count: { $sum: 1 },
					},
				},
			]),
		])

		const counts = Object.fromEntries(
			recentMovementCounts.map(entry => [entry._id, entry.count])
		)
		return res.json({
			summary: {
				totalProducts,
				outOfStockProducts,
				lowStockProducts,
				incomingMovements24h: counts.incoming || 0,
				outgoingMovements24h: counts.outgoing || 0,
			},
		})
	} catch (error) {
		console.error('Get inventory summary error:', error)
		return res.status(500).json({ message: 'Server error fetching inventory summary' })
	}
})

router.get(
	'/products',
	[
		query('search').optional().isString().isLength({ max: 100 }),
		query('category').optional().isString().isLength({ max: 50 }),
		query('status')
			.optional()
			.isIn(['all', 'available', 'low', 'out', 'uninitialized']),
		query('page').optional().isInt({ min: 1 }),
		query('limit').optional().isInt({ min: 1, max: 100 }),
	],
	validateRequest,
	async (req, res) => {
	try {
		const {
			search,
			category,
			status = 'all',
			page = 1,
			limit = 20,
		} = req.query
		const filter = {}

		if (search) {
			const safeSearch = escapeRegex(search)
			filter.$or = [
				{ name: { $regex: safeSearch, $options: 'i' } },
				{ supplier: { $regex: safeSearch, $options: 'i' } },
			]
		}
		if (category && category !== 'all') filter.category = category
		if (status === 'out') filter.amount = { $lte: 0 }
		if (status === 'available') filter.amount = { $gt: 0 }
		if (status === 'uninitialized') filter.inventoryInitialized = { $ne: true }
		if (status === 'low') {
			filter.amount = { $gt: 0 }
			filter.minimumStock = { $gt: 0 }
			filter.$expr = { $lte: ['$amount', '$minimumStock'] }
		}

		const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1)
		const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100)
		const [products, total] = await Promise.all([
			Product.find(filter)
				.sort({ name: 1 })
				.skip((pageNumber - 1) * pageSize)
				.limit(pageSize)
				.lean(),
			Product.countDocuments(filter),
		])

		return res.json({
			products,
			pagination: {
				current: pageNumber,
				pages: Math.max(Math.ceil(total / pageSize), 1),
				total,
			},
		})
	} catch (error) {
		console.error('Get inventory products error:', error)
		return res.status(500).json({ message: 'Server error fetching inventory products' })
	}
	}
)

router.get(
	'/movements',
	[
		query('productId').optional().isMongoId(),
		query('type').optional().isIn(['all', ...StockMovement.MOVEMENT_TYPES]),
		query('startDate').optional().isISO8601(),
		query('endDate').optional().isISO8601(),
		query('page').optional().isInt({ min: 1 }),
		query('limit').optional().isInt({ min: 1, max: 100 }),
	],
	validateRequest,
	async (req, res) => {
	try {
		const {
			productId,
			type,
			startDate,
			endDate,
			page = 1,
			limit = 20,
		} = req.query
		const filter = {}
		if (productId) filter.product = productId
		if (type && type !== 'all') filter.type = type
		if (startDate || endDate) {
			filter.createdAt = {}
			if (startDate) filter.createdAt.$gte = new Date(startDate)
			if (endDate) filter.createdAt.$lte = new Date(endDate)
		}

		const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1)
		const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100)
		const [movements, total] = await Promise.all([
			StockMovement.find(filter)
				.populate('product', 'name unit category')
				.populate('createdBy', 'username position')
				.sort({ createdAt: -1 })
				.skip((pageNumber - 1) * pageSize)
				.limit(pageSize)
				.lean(),
			StockMovement.countDocuments(filter),
		])

		return res.json({
			movements,
			pagination: {
				current: pageNumber,
				pages: Math.max(Math.ceil(total / pageSize), 1),
				total,
			},
		})
	} catch (error) {
		console.error('Get stock movements error:', error)
		return res.status(500).json({ message: 'Server error fetching stock movements' })
	}
	}
)

router.post(
	'/movements',
	[
		body('productId').isMongoId().withMessage('Valid product ID is required'),
		body('mode').isIn(['in', 'out', 'set']).withMessage('Invalid movement mode'),
		body('quantity').optional().isFloat({ gt: 0 }),
		body('targetBalance').optional().isFloat({ min: 0 }),
		body('reason')
			.isString()
			.trim()
			.isLength({ min: 3, max: 500 })
			.withMessage('Reason must be between 3 and 500 characters'),
	],
	async (req, res) => {
		try {
			const errors = validationResult(req)
			if (!errors.isEmpty()) {
				return res.status(400).json({
					message: 'Validation failed',
					errors: errors.array(),
				})
			}

			const { productId, mode, quantity, targetBalance, reason } = req.body
			if (mode !== 'set' && quantity === undefined) {
				return res.status(400).json({ message: 'Quantity is required' })
			}
			if (mode === 'set' && targetBalance === undefined) {
				return res.status(400).json({ message: 'Target balance is required' })
			}

			const product = await createManualMovement({
				productId,
				mode,
				quantity,
				targetBalance,
				reason,
				userId: req.user._id,
			})
			return res.status(201).json({
				message: 'Inventory updated successfully',
				product,
			})
		} catch (error) {
			if (error instanceof InventoryError) {
				return res.status(error.statusCode).json({
					message: error.message,
					code: error.code,
					details: error.details,
				})
			}
			console.error('Create stock movement error:', error)
			return res.status(500).json({ message: 'Server error updating inventory' })
		}
	}
)

module.exports = router
