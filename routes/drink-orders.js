const express = require('express')
const { body, validationResult } = require('express-validator')
const DrinkOrder = require('../models/DrinkOrder')
const Product = require('../models/Product')
const {
	authenticate,
	requireWorker,
	requireAdminOrEditor,
} = require('../middleware/auth')

const router = express.Router()

const DRINK_CATEGORIES = new Set(['drinks', 'beverages'])

const validateDrinkProducts = async (items) => {
	const productIds = items.map(item => item.product)
	const products = await Product.find({
		_id: { $in: productIds },
		isActive: true,
	})

	if (products.length !== productIds.length) {
		return {
			valid: false,
			message: 'One or more products are invalid or inactive',
		}
	}

	const nonDrinkProducts = products.filter(
		product => !DRINK_CATEGORIES.has(product.category)
	)

	if (nonDrinkProducts.length > 0) {
		return {
			valid: false,
			message: 'Only drink products are allowed in drink orders',
			invalidProducts: nonDrinkProducts.map(product => product.name),
		}
	}

	return { valid: true }
}

const generateDrinkOrderNumber = async () => {
	const now = new Date()
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
	const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

	const count = await DrinkOrder.countDocuments({
		createdAt: { $gte: startOfDay, $lt: endOfDay },
	})

	return `DRK-${dateStr}-${String(count + 1).padStart(3, '0')}`
}

router.get('/', authenticate, async (req, res) => {
	try {
		const { date, branch, status, page = 1, limit = 10 } = req.query
		const filter = {}

		if (req.user.position === 'worker' && req.query.viewAll !== 'true') {
			filter.worker = req.user._id
		}

		if (
			branch &&
			(['admin', 'editor'].includes(req.user.position) ||
				(req.user.position === 'worker' && req.query.viewAll === 'true'))
		) {
			filter.branch = branch
		}

		if (date) {
			const startDate = new Date(date)
			const endDate = new Date(date)
			endDate.setDate(endDate.getDate() + 1)
			filter.requestedDate = { $gte: startDate, $lt: endDate }
		}

		if (status && status !== 'all') {
			filter.status = status
		}

		const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10)
		const drinkOrders = await DrinkOrder.find(filter)
			.populate('worker', 'username branch')
			.populate('items.product', 'name unit category price images')
			.populate('processedBy', 'username')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit, 10))

		const total = await DrinkOrder.countDocuments(filter)

		res.json({
			drinkOrders,
			pagination: {
				current: parseInt(page, 10),
				pages: Math.ceil(total / parseInt(limit, 10)),
				total,
			},
		})
	} catch (error) {
		console.error('Get drink orders error:', error)
		res.status(500).json({ message: 'Server error fetching drink orders' })
	}
})

router.get('/:id', authenticate, async (req, res) => {
	try {
		const drinkOrder = await DrinkOrder.findById(req.params.id)
			.populate('worker', 'username branch')
			.populate('items.product', 'name unit category supplier price images')
			.populate('processedBy', 'username')

		if (!drinkOrder) {
			return res.status(404).json({ message: 'Drink order not found' })
		}

		if (
			req.user.position === 'worker' &&
			drinkOrder.worker._id.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: 'Access denied' })
		}

		res.json({ drinkOrder })
	} catch (error) {
		console.error('Get drink order error:', error)
		res.status(500).json({ message: 'Server error fetching drink order' })
	}
})

router.post(
	'/',
	authenticate,
	requireWorker,
	[
		body('branch').trim().isLength({ min: 1 }).withMessage('Branch is required'),
		body('requestedDate')
			.isISO8601()
			.withMessage('Valid requested date is required'),
		body('items')
			.isArray({ min: 1 })
			.withMessage('At least one drink item is required'),
		body('items.*.product')
			.isMongoId()
			.withMessage('Valid product ID is required'),
		body('items.*.quantity')
			.isInt({ min: 1 })
			.withMessage('Quantity must be at least 1'),
		body('notes')
			.optional()
			.isLength({ max: 500 })
			.withMessage('Order notes cannot exceed 500 characters'),
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

			const { branch, requestedDate, items, notes } = req.body
			const validation = await validateDrinkProducts(items)

			if (!validation.valid) {
				return res.status(400).json(validation)
			}

			const orderNumber = await generateDrinkOrderNumber()
			const drinkOrder = new DrinkOrder({
				orderNumber,
				worker: req.user._id,
				branch,
				requestedDate: new Date(requestedDate),
				items,
				notes,
			})

			await drinkOrder.save()
			await drinkOrder.populate([
				{ path: 'worker', select: 'username branch' },
				{ path: 'items.product', select: 'name unit category price' },
			])

			res.status(201).json({
				message: 'Drink order created successfully',
				drinkOrder,
			})
		} catch (error) {
			console.error('Create drink order error:', error)
			res.status(500).json({ message: 'Server error creating drink order' })
		}
	}
)

router.put(
	'/:id',
	authenticate,
	[
		body('requestedDate')
			.optional()
			.isISO8601()
			.withMessage('Valid requested date is required'),
		body('items')
			.optional()
			.isArray({ min: 1 })
			.withMessage('At least one drink item is required'),
		body('items.*.product')
			.optional()
			.isMongoId()
			.withMessage('Valid product ID is required'),
		body('items.*.quantity')
			.optional()
			.isInt({ min: 1 })
			.withMessage('Quantity must be at least 1'),
		body('notes')
			.optional()
			.isLength({ max: 500 })
			.withMessage('Order notes cannot exceed 500 characters'),
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

			const drinkOrder = await DrinkOrder.findById(req.params.id)
			if (!drinkOrder) {
				return res.status(404).json({ message: 'Drink order not found' })
			}

			if (
				req.user.position === 'worker' &&
				drinkOrder.worker.toString() !== req.user._id.toString()
			) {
				return res.status(403).json({ message: 'Access denied' })
			}

			if (drinkOrder.status !== 'pending') {
				return res
					.status(400)
					.json({ message: 'Only pending drink orders can be edited' })
			}

			const updateData = {}

			if (req.body.requestedDate) {
				updateData.requestedDate = new Date(req.body.requestedDate)
			}

			if (req.body.items) {
				const validation = await validateDrinkProducts(req.body.items)
				if (!validation.valid) {
					return res.status(400).json(validation)
				}
				updateData.items = req.body.items
			}

			if (req.body.notes !== undefined) {
				updateData.notes = req.body.notes
			}

			const updatedDrinkOrder = await DrinkOrder.findByIdAndUpdate(
				req.params.id,
				updateData,
				{ new: true, runValidators: true }
			).populate([
				{ path: 'worker', select: 'username branch' },
				{ path: 'items.product', select: 'name unit category price' },
			])

			res.json({
				message: 'Drink order updated successfully',
				drinkOrder: updatedDrinkOrder,
			})
		} catch (error) {
			console.error('Update drink order error:', error)
			res.status(500).json({ message: 'Server error updating drink order' })
		}
	}
)

router.patch(
	'/:id/status',
	authenticate,
	requireAdminOrEditor,
	[
		body('status')
			.isIn(['pending', 'approved', 'rejected', 'completed'])
			.withMessage('Invalid status'),
		body('adminNotes')
			.optional()
			.isLength({ max: 500 })
			.withMessage('Admin notes cannot exceed 500 characters'),
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

			const drinkOrder = await DrinkOrder.findById(req.params.id)
			if (!drinkOrder) {
				return res.status(404).json({ message: 'Drink order not found' })
			}

			drinkOrder.status = req.body.status
			if (req.body.adminNotes) {
				drinkOrder.adminNotes = req.body.adminNotes
			}
			drinkOrder.processedBy = req.user._id
			drinkOrder.processedAt = new Date()

			await drinkOrder.save()
			await drinkOrder.populate([
				{ path: 'worker', select: 'username branch' },
				{ path: 'items.product', select: 'name unit category price' },
				{ path: 'processedBy', select: 'username' },
			])

			res.json({
				message: 'Drink order status updated successfully',
				drinkOrder,
			})
		} catch (error) {
			console.error('Update drink order status error:', error)
			res
				.status(500)
				.json({ message: 'Server error updating drink order status' })
		}
	}
)

router.delete('/:id', authenticate, async (req, res) => {
	try {
		const drinkOrder = await DrinkOrder.findById(req.params.id)
		if (!drinkOrder) {
			return res.status(404).json({ message: 'Drink order not found' })
		}

		if (
			req.user.position === 'worker' &&
			drinkOrder.worker.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: 'Access denied' })
		}

		if (drinkOrder.status !== 'pending') {
			return res
				.status(400)
				.json({ message: 'Only pending drink orders can be deleted' })
		}

		await DrinkOrder.findByIdAndDelete(req.params.id)

		res.json({ message: 'Drink order deleted successfully' })
	} catch (error) {
		console.error('Delete drink order error:', error)
		res.status(500).json({ message: 'Server error deleting drink order' })
	}
})

module.exports = router
