const express = require('express')
const { body, validationResult } = require('express-validator')
const Order = require('../models/Order')
const Product = require('../models/Product')
const {
	authenticate,
	requireAdmin,
	requireWorker,
	requireAdminOrEditor,
} = require('../middleware/auth')
const { generateOrdersPDF } = require('../utils/pdfGenerator')

const router = express.Router()

// Get orders based on user role
router.get('/', authenticate, async (req, res) => {
	try {
		const { date, branch, status, page = 1, limit = 10 } = req.query
		const filter = {}

		// Workers can only see their own orders
		if (req.user.position === 'worker') {
			filter.worker = req.user._id
		}

		// Admins and editors can filter by branch
		if (branch && ['admin', 'editor'].includes(req.user.position)) {
			filter.branch = branch
		}

		// Filter by date
		if (date) {
			const startDate = new Date(date)
			const endDate = new Date(date)
			endDate.setDate(endDate.getDate() + 1)

			filter.requestedDate = {
				$gte: startDate,
				$lt: endDate,
			}
		}

		// Filter by status
		if (status && status !== 'all') {
			filter.status = status
		}

		const skip = (parseInt(page) - 1) * parseInt(limit)

		const orders = await Order.find(filter)
			.populate('worker', 'username branch')
			.populate('items.product', 'name unit category')
			.populate('processedBy', 'username')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))

		const total = await Order.countDocuments(filter)

		res.json({
			orders,
			pagination: {
				current: parseInt(page),
				pages: Math.ceil(total / parseInt(limit)),
				total,
			},
		})
	} catch (error) {
		console.error('Get orders error:', error)
		res.status(500).json({ message: 'Server error fetching orders' })
	}
})

// Get single order by ID
router.get('/:id', authenticate, async (req, res) => {
	try {
		const order = await Order.findById(req.params.id)
			.populate('worker', 'username branch')
			.populate('items.product', 'name unit category supplier')
			.populate('processedBy', 'username')

		if (!order) {
			return res.status(404).json({ message: 'Order not found' })
		}

		// Workers can only see their own orders
		if (
			req.user.position === 'worker' &&
			order.worker._id.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: 'Access denied' })
		}

		res.json({ order })
	} catch (error) {
		console.error('Get order error:', error)
		res.status(500).json({ message: 'Server error fetching order' })
	}
})

// Create new order (workers only)
router.post(
	'/',
	authenticate,
	requireWorker,
	[
		body('branch')
			.trim()
			.isLength({ min: 1 })
			.withMessage('Branch is required'),
		body('requestedDate')
			.isISO8601()
			.withMessage('Valid requested date is required'),
		body('items')
			.isArray({ min: 1 })
			.withMessage('At least one item is required'),
		body('items.*.product')
			.isMongoId()
			.withMessage('Valid product ID is required'),
		body('items.*.quantity')
			.isInt({ min: 1 })
			.withMessage('Quantity must be at least 1'),
		body('items.*.notes')
			.optional()
			.isLength({ max: 200 })
			.withMessage('Item notes cannot exceed 200 characters'),
		body('notes')
			.optional()
			.isLength({ max: 500 })
			.withMessage('Order notes cannot exceed 500 characters'),
	],
	async (req, res) => {
		try {
			console.log('=== ORDER CREATION DEBUG START ===')
			console.log('User:', req.user)
			console.log('Request body:', JSON.stringify(req.body, null, 2))

			const errors = validationResult(req)
			if (!errors.isEmpty()) {
				console.log('Validation errors:', errors.array())
				return res.status(400).json({
					message: 'Validation failed',
					errors: errors.array(),
				})
			}

			const { branch, requestedDate, items, notes } = req.body

			console.log('Extracted data:')
			console.log('- branch:', branch)
			console.log('- requestedDate:', requestedDate)
			console.log('- items:', items)
			console.log('- notes:', notes)
			console.log('- user.branch:', req.user.branch)

			// Validate that all products exist and are active
			const productIds = items.map(item => item.product)
			console.log('Product IDs to validate:', productIds)

			const products = await Product.find({
				_id: { $in: productIds },
				isActive: true,
			})

			console.log(
				'Found products:',
				products.length,
				'out of',
				productIds.length
			)

			if (products.length !== productIds.length) {
				console.log('Product validation failed')
				return res.status(400).json({
					message: 'One or more products are invalid or inactive',
				})
			}

			// Check if requested date is not in the past
			const requestedDateTime = new Date(requestedDate)
			const today = new Date()
			today.setHours(0, 0, 0, 0)

			console.log('Date validation:')
			console.log('- requestedDateTime:', requestedDateTime)
			console.log('- today:', today)

			if (requestedDateTime < today) {
				console.log('Date validation failed - date in past')
				return res.status(400).json({
					message: 'Requested date cannot be in the past',
				})
			}

			console.log('Creating order object...')

			// Generate order number manually (workaround for pre-save hook)
			let orderNumber
			try {
				const date = new Date()
				const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')

				// Get start and end of today for counting
				const startOfDay = new Date(
					date.getFullYear(),
					date.getMonth(),
					date.getDate()
				)
				const endOfDay = new Date(
					date.getFullYear(),
					date.getMonth(),
					date.getDate() + 1
				)

				console.log('Manually generating order number for date:', dateStr)

				// Count orders created today
				const count = await Order.countDocuments({
					createdAt: {
						$gte: startOfDay,
						$lt: endOfDay,
					},
				})

				console.log('Found', count, 'orders today')

				// Generate order number
				orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(3, '0')}`

				console.log('Generated order number:', orderNumber)

				// Check if this order number already exists (handle race conditions)
				const existingOrder = await Order.findOne({ orderNumber })
				if (existingOrder) {
					console.log('Order number exists, adding random suffix')
					const randomSuffix = Math.floor(Math.random() * 1000)
						.toString()
						.padStart(3, '0')
					orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(
						3,
						'0'
					)}-${randomSuffix}`
					console.log('New order number with suffix:', orderNumber)
				}
			} catch (error) {
				console.error('Error in manual orderNumber generation:', error)
				// Fallback: use timestamp-based order number
				const timestamp = Date.now().toString().slice(-8)
				orderNumber = `ORD-${timestamp}`
				console.log('Using fallback order number:', orderNumber)
			}

			const orderData = {
				orderNumber,
				worker: req.user._id,
				branch: branch,
				requestedDate: requestedDateTime,
				items,
				notes,
			}

			console.log('Order data to save:', JSON.stringify(orderData, null, 2))

			const order = new Order(orderData)

			console.log('Order object created, attempting to save...')
			await order.save()

			console.log('Order saved successfully, populating...')
			await order.populate([
				{ path: 'worker', select: 'username branch' },
				{ path: 'items.product', select: 'name unit category' },
			])

			console.log('Order creation completed successfully')
			console.log('=== ORDER CREATION DEBUG END ===')

			res.status(201).json({
				message: 'Order created successfully',
				order,
			})
		} catch (error) {
			console.error('=== ORDER CREATION ERROR ===')
			console.error('Error type:', error.constructor.name)
			console.error('Error message:', error.message)
			console.error('Error stack:', error.stack)

			if (error.name === 'ValidationError') {
				console.error('Validation error details:', error.errors)
				return res.status(400).json({
					message: 'Validation failed',
					details: Object.keys(error.errors).map(key => ({
						field: key,
						message: error.errors[key].message,
					})),
				})
			}

			if (error.code === 11000) {
				console.error('Duplicate key error:', error.keyValue)
				return res.status(400).json({
					message: 'Duplicate order number. Please try again.',
				})
			}

			console.error('=== ORDER CREATION ERROR END ===')
			res.status(500).json({ message: 'Server error creating order' })
		}
	}
)

// Update order status (admin only)
router.patch(
	'/:id/status',
	authenticate,
	requireAdmin,
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

			const { status, adminNotes } = req.body

			const order = await Order.findById(req.params.id)
			if (!order) {
				return res.status(404).json({ message: 'Order not found' })
			}

			order.status = status
			if (adminNotes) {
				order.adminNotes = adminNotes
			}
			order.processedBy = req.user._id
			order.processedAt = new Date()

			await order.save()
			await order.populate([
				{ path: 'worker', select: 'username branch' },
				{ path: 'items.product', select: 'name unit category' },
				{ path: 'processedBy', select: 'username' },
			])

			res.json({
				message: 'Order status updated successfully',
				order,
			})
		} catch (error) {
			console.error('Update order status error:', error)
			res.status(500).json({ message: 'Server error updating order status' })
		}
	}
)

// Update order (workers can only update their own pending orders)
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
			.withMessage('At least one item is required'),
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

			const order = await Order.findById(req.params.id)
			if (!order) {
				return res.status(404).json({ message: 'Order not found' })
			}

			// Workers can only edit their own orders
			if (
				req.user.position === 'worker' &&
				order.worker.toString() !== req.user._id.toString()
			) {
				return res.status(403).json({ message: 'Access denied' })
			}

			// Only pending orders can be edited
			if (order.status !== 'pending') {
				return res
					.status(400)
					.json({ message: 'Only pending orders can be edited' })
			}

			const updateData = {}
			if (req.body.requestedDate) {
				const requestedDateTime = new Date(req.body.requestedDate)
				const today = new Date()
				today.setHours(0, 0, 0, 0)

				if (requestedDateTime < today) {
					return res.status(400).json({
						message: 'Requested date cannot be in the past',
					})
				}
				updateData.requestedDate = requestedDateTime
			}

			if (req.body.items) {
				// Validate products
				const productIds = req.body.items.map(item => item.product)
				const products = await Product.find({
					_id: { $in: productIds },
					isActive: true,
				})

				if (products.length !== productIds.length) {
					return res.status(400).json({
						message: 'One or more products are invalid or inactive',
					})
				}
				updateData.items = req.body.items
			}

			if (req.body.notes !== undefined) {
				updateData.notes = req.body.notes
			}

			const updatedOrder = await Order.findByIdAndUpdate(
				req.params.id,
				updateData,
				{ new: true, runValidators: true }
			).populate([
				{ path: 'worker', select: 'username branch' },
				{ path: 'items.product', select: 'name unit category' },
			])

			res.json({
				message: 'Order updated successfully',
				order: updatedOrder,
			})
		} catch (error) {
			console.error('Update order error:', error)
			res.status(500).json({ message: 'Server error updating order' })
		}
	}
)

// Delete order (workers can only delete their own pending orders)
router.delete('/:id', authenticate, async (req, res) => {
	try {
		const order = await Order.findById(req.params.id)
		if (!order) {
			return res.status(404).json({ message: 'Order not found' })
		}

		// Workers can only delete their own orders, admins can delete any
		if (
			req.user.position === 'worker' &&
			order.worker.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: 'Access denied' })
		}

		// Only pending orders can be deleted
		if (order.status !== 'pending') {
			return res
				.status(400)
				.json({ message: 'Only pending orders can be deleted' })
		}

		await Order.findByIdAndDelete(req.params.id)

		res.json({ message: 'Order deleted successfully' })
	} catch (error) {
		console.error('Delete order error:', error)
		res.status(500).json({ message: 'Server error deleting order' })
	}
})

// Export orders to PDF (admin/editor only)
router.get(
	'/export/pdf',
	authenticate,
	requireAdminOrEditor,
	async (req, res) => {
		try {
			const { date, branch } = req.query

			if (!date) {
				return res.status(400).json({ message: 'Date is required' })
			}

			const filter = {}

			// Filter by date
			const startDate = new Date(date)
			const endDate = new Date(date)
			endDate.setDate(endDate.getDate() + 1)

			filter.requestedDate = {
				$gte: startDate,
				$lt: endDate,
			}

			// Filter by branch if specified
			if (branch && branch !== 'all') {
				filter.branch = branch
			}

			const orders = await Order.find(filter)
				.populate('worker', 'username branch')
				.populate('items.product', 'name unit category supplier')
				.sort({ branch: 1, worker: 1 })

			res.json({ orders })
		} catch (error) {
			console.error('Export orders error:', error)
			res.status(500).json({ message: 'Server error exporting orders' })
		}
	}
)

// Get dashboard statistics (admin/editor only)
router.get(
	'/stats/dashboard',
	authenticate,
	requireAdminOrEditor,
	async (req, res) => {
		try {
			const today = new Date()
			const startOfDay = new Date(
				today.getFullYear(),
				today.getMonth(),
				today.getDate()
			)
			const endOfDay = new Date(
				today.getFullYear(),
				today.getMonth(),
				today.getDate() + 1
			)

			const [todayOrders, totalOrders, pendingOrders, branchStats] =
				await Promise.all([
					Order.countDocuments({
						createdAt: { $gte: startOfDay, $lt: endOfDay },
					}),
					Order.countDocuments(),
					Order.countDocuments({ status: 'pending' }),
					Order.aggregate([
						{
							$group: {
								_id: '$branch',
								totalOrders: { $sum: 1 },
								pendingOrders: {
									$sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
								},
							},
						},
					]),
				])

			res.json({
				todayOrders,
				totalOrders,
				pendingOrders,
				branchStats,
			})
		} catch (error) {
			console.error('Get order stats error:', error)
			res
				.status(500)
				.json({ message: 'Server error fetching order statistics' })
		}
	}
)

// Download PDF report (admin/editor only)
router.get(
	'/download/pdf',
	authenticate,
	requireAdminOrEditor,
	async (req, res) => {
		try {
			const { date, branch } = req.query

			if (!date) {
				return res.status(400).json({ message: 'Date is required' })
			}

			const filter = {}

			// Filter by date
			const startDate = new Date(date)
			const endDate = new Date(date)
			endDate.setDate(endDate.getDate() + 1)

			filter.requestedDate = {
				$gte: startDate,
				$lt: endDate,
			}

			// Filter by branch if specified
			if (branch && branch !== 'all') {
				filter.branch = branch
			}

			const orders = await Order.find(filter)
				.populate('worker', 'username branch')
				.populate('items.product', 'name unit category supplier')
				.sort({ branch: 1, worker: 1 })

			if (orders.length === 0) {
				return res
					.status(404)
					.json({ message: 'No orders found for the specified criteria' })
			}

			const pdfBuffer = await generateOrdersPDF(orders, { date, branch })

			const filename = `orders-${date}${
				branch && branch !== 'all' ? `-${branch}` : ''
			}.pdf`

			res.setHeader('Content-Type', 'application/pdf')
			res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
			res.setHeader('Content-Length', pdfBuffer.length)

			res.send(pdfBuffer)
		} catch (error) {
			console.error('Download PDF error:', error)
			res.status(500).json({ message: 'Server error generating PDF' })
		}
	}
)

module.exports = router
