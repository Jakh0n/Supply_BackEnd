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
		console.log('🔍 [BACKEND DEBUG] Orders API request:', {
			userId: req.user._id,
			username: req.user.username,
			position: req.user.position,
			isActive: req.user.isActive,
			viewAll: req.query.viewAll,
			queryParams: req.query,
		})

		const {
			date,
			month,
			year,
			branch,
			status,
			page = 1,
			limit = 10,
		} = req.query
		const filter = {}

		// Workers can see their own orders or all orders if specifically requested
		if (req.user.position === 'worker') {
			// Allow workers to see all orders when 'viewAll' parameter is true
			if (req.query.viewAll !== 'true') {
				console.log('📝 [BACKEND DEBUG] Worker viewing own orders only')
				filter.worker = req.user._id
			} else {
				console.log(
					'🌐 [BACKEND DEBUG] Worker viewing ALL orders (viewAll=true)'
				)
			}
		}

		// Admins, editors, and workers (when viewing all) can filter by branch
		if (
			branch &&
			(['admin', 'editor'].includes(req.user.position) ||
				(req.user.position === 'worker' && req.query.viewAll === 'true'))
		) {
			filter.branch = branch
		}

		// Filter by date - support both single date and month/year filtering
		if (date) {
			// Single date filtering (existing functionality)
			const startDate = new Date(date)
			const endDate = new Date(date)
			endDate.setDate(endDate.getDate() + 1)

			filter.requestedDate = {
				$gte: startDate,
				$lt: endDate,
			}
		} else if (month && year) {
			// Month/year filtering (new functionality)
			const selectedMonth = parseInt(month) - 1 // JavaScript months are 0-based
			const selectedYear = parseInt(year)

			// Set start date to the first day of the selected month
			const startDate = new Date(selectedYear, selectedMonth, 1)

			// Set end date to the first day of the next month
			const endDate = new Date(selectedYear, selectedMonth + 1, 1)

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

		console.log('🔍 [BACKEND DEBUG] Final MongoDB filter:', filter)

		const orders = await Order.find(filter)
			.populate('worker', 'username branch')
			.populate('items.product', 'name unit category price images')
			.populate('processedBy', 'username')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))

		const total = await Order.countDocuments(filter)

		console.log('✅ [BACKEND DEBUG] Orders query result:', {
			totalOrdersFound: total,
			ordersReturned: orders.length,
			filter: filter,
			page: parseInt(page),
			limit: parseInt(limit),
		})

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
			.populate('items.product', 'name unit category supplier price images')
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
				console.log('=== VALIDATION ERRORS ===')
				console.log('Errors:', JSON.stringify(errors.array(), null, 2))
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
			console.log('=== PRODUCT VALIDATION DEBUG ===')
			console.log('Product IDs to validate:', productIds)
			console.log(
				'Product IDs types:',
				productIds.map(id => typeof id)
			)

			// Check if all products exist (including inactive ones)
			const allProducts = await Product.find({
				_id: { $in: productIds },
			})

			console.log('All products found (active + inactive):', allProducts.length)
			console.log(
				'All products details:',
				allProducts.map(p => ({
					id: p._id,
					name: p.name,
					isActive: p.isActive,
				}))
			)

			// Check for active products only
			const activeProducts = await Product.find({
				_id: { $in: productIds },
				isActive: true,
			})

			console.log('Active products found:', activeProducts.length)
			console.log(
				'Active products details:',
				activeProducts.map(p => ({
					id: p._id,
					name: p.name,
					isActive: p.isActive,
				}))
			)

			// Find missing products
			const foundIds = allProducts.map(p => p._id.toString())
			const missingIds = productIds.filter(
				id => !foundIds.includes(id.toString())
			)
			if (missingIds.length > 0) {
				console.log('❌ Missing products:', missingIds)
			}

			// Find inactive products
			const inactiveProducts = allProducts.filter(p => !p.isActive)
			if (inactiveProducts.length > 0) {
				console.log(
					'❌ Inactive products:',
					inactiveProducts.map(p => ({
						id: p._id,
						name: p.name,
					}))
				)
			}

			if (activeProducts.length !== productIds.length) {
				console.log('❌ Product validation failed')
				console.log(
					'Expected:',
					productIds.length,
					'Got:',
					activeProducts.length
				)
				return res.status(400).json({
					message: 'One or more products are invalid or inactive',
					details: {
						totalRequested: productIds.length,
						activeFound: activeProducts.length,
						missingProducts: missingIds,
						inactiveProducts: inactiveProducts.map(p => p.name),
					},
				})
			}

			console.log('✅ Product validation passed')

			// Check if requested date is not in the past
			// Temporarily disable date validation for debugging
			console.log('=== DATE VALIDATION DEBUG ===')
			console.log('- requestedDate string:', requestedDate)
			console.log('⚠️  DATE VALIDATION TEMPORARILY DISABLED FOR DEBUGGING')

			// TODO: Re-enable date validation once production issue is resolved
			/*
			const [year, month, day] = requestedDate.split('-').map(Number)
			const requestedDateTime = new Date(year, month - 1, day)
			const today = new Date()
			today.setHours(0, 0, 0, 0)

			if (requestedDateTime < today) {
				return res.status(400).json({
					message: 'Requested date cannot be in the past',
				})
			}
			*/

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

			// Convert requestedDate string to Date object
			const requestedDateTime = new Date(requestedDate)

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
				{ path: 'items.product', select: 'name unit category price' },
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

// Update order status (admin/editor only)
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
				{ path: 'items.product', select: 'name unit category price' },
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
				// Parse date string as local date to avoid timezone issues
				const [year, month, day] = req.body.requestedDate.split('-').map(Number)
				const requestedDateTime = new Date(year, month - 1, day) // month is 0-based

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
				{ path: 'items.product', select: 'name unit category price' },
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
				.populate('items.product', 'name unit category supplier price images')
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

			// Calculate total revenue from all approved/completed orders
			const revenueCalculation = await Order.aggregate([
				{
					$match: {
						status: { $in: ['approved', 'completed'] },
					},
				},
				{
					$unwind: '$items',
				},
				{
					$lookup: {
						from: 'products',
						localField: 'items.product',
						foreignField: '_id',
						as: 'productDetails',
					},
				},
				{
					$unwind: '$productDetails',
				},
				{
					$group: {
						_id: null,
						totalRevenue: {
							$sum: {
								$multiply: ['$items.quantity', '$productDetails.price'],
							},
						},
						totalItems: { $sum: '$items.quantity' },
						avgOrderValue: {
							$avg: { $multiply: ['$items.quantity', '$productDetails.price'] },
						},
					},
				},
			])

			// Calculate today's revenue
			const todayRevenue = await Order.aggregate([
				{
					$match: {
						createdAt: { $gte: startOfDay, $lt: endOfDay },
						status: { $in: ['approved', 'completed'] },
					},
				},
				{
					$unwind: '$items',
				},
				{
					$lookup: {
						from: 'products',
						localField: 'items.product',
						foreignField: '_id',
						as: 'productDetails',
					},
				},
				{
					$unwind: '$productDetails',
				},
				{
					$group: {
						_id: null,
						todayRevenue: {
							$sum: {
								$multiply: ['$items.quantity', '$productDetails.price'],
							},
						},
					},
				},
			])

			const [todayOrders, todayCompletedOrders, pendingOrders, branchStats] =
				await Promise.all([
					Order.countDocuments({
						createdAt: { $gte: startOfDay, $lt: endOfDay },
					}),
					Order.countDocuments({
						createdAt: { $gte: startOfDay, $lt: endOfDay },
						status: { $in: ['approved', 'completed'] },
					}),
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

			const totalRevenue = revenueCalculation[0]?.totalRevenue || 0
			const todayRevenueAmount = todayRevenue[0]?.todayRevenue || 0

			res.json({
				todayOrders,
				todayCompletedOrders,
				pendingOrders,
				totalRevenue,
				todayRevenue: todayRevenueAmount,
				totalItems: revenueCalculation[0]?.totalItems || 0,
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

// Get branch analytics (admin/editor only)
router.get(
	'/analytics/branches',
	authenticate,
	requireAdminOrEditor,
	async (req, res) => {
		try {
			const { timeframe = 'week', month, year } = req.query

			// Calculate date range based on month/year or timeframe
			const now = new Date()
			let startDate = new Date()
			let previousStartDate = new Date()

			// If month and year are provided, use them for filtering
			if (month && year) {
				const selectedMonth = parseInt(month) - 1 // JavaScript months are 0-based
				const selectedYear = parseInt(year)

				// Set start date to the first day of the selected month
				startDate = new Date(selectedYear, selectedMonth, 1)

				// Set end date to the first day of the next month
				const endDate = new Date(selectedYear, selectedMonth + 1, 1)

				// Set previous period dates for comparison
				const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1
				const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear
				previousStartDate = new Date(prevYear, prevMonth, 1)
				const previousEndDate = new Date(prevYear, prevMonth + 1, 1)

				// Override now with endDate for month/year filtering
				now.setTime(endDate.getTime())
			} else {
				// Use existing timeframe logic
				switch (timeframe) {
					case 'day':
						startDate.setDate(now.getDate() - 1)
						previousStartDate.setDate(now.getDate() - 2)
						break
					case 'week':
						startDate.setDate(now.getDate() - 7)
						previousStartDate.setDate(now.getDate() - 14)
						break
					case 'month':
						startDate.setMonth(now.getMonth() - 1)
						previousStartDate.setMonth(now.getMonth() - 2)
						break
					case 'quarter':
						startDate.setMonth(now.getMonth() - 3)
						previousStartDate.setMonth(now.getMonth() - 6)
						break
					default:
						startDate.setDate(now.getDate() - 7)
						previousStartDate.setDate(now.getDate() - 14)
				}
			}

			// Get current period analytics
			const currentPeriodAnalytics = await Order.aggregate([
				{
					$match: {
						createdAt: { $gte: startDate, $lte: now },
					},
				},
				{
					$lookup: {
						from: 'products',
						localField: 'items.product',
						foreignField: '_id',
						as: 'productDetails',
					},
				},
				{
					$unwind: '$items',
				},
				{
					$lookup: {
						from: 'products',
						localField: 'items.product',
						foreignField: '_id',
						as: 'itemProduct',
					},
				},
				{
					$unwind: '$itemProduct',
				},
				{
					$group: {
						_id: '$branch',
						totalOrders: { $addToSet: '$_id' },
						pendingOrders: {
							$sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
						},
						completedOrders: {
							$sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
						},
						totalValue: {
							$sum: { $multiply: ['$items.quantity', '$itemProduct.price'] },
						},
						products: {
							$push: {
								name: '$itemProduct.name',
								quantity: '$items.quantity',
								value: { $multiply: ['$items.quantity', '$itemProduct.price'] },
							},
						},
					},
				},
				{
					$project: {
						branch: '$_id',
						totalOrders: { $size: '$totalOrders' },
						pendingOrders: 1,
						completedOrders: 1,
						totalValue: 1,
						avgOrderValue: {
							$cond: [
								{ $gt: [{ $size: '$totalOrders' }, 0] },
								{ $divide: ['$totalValue', { $size: '$totalOrders' }] },
								0,
							],
						},
						products: 1,
					},
				},
			])

			// Get previous period for trend calculation
			const previousPeriodAnalytics = await Order.aggregate([
				{
					$match: {
						createdAt: { $gte: previousStartDate, $lt: startDate },
					},
				},
				{
					$group: {
						_id: '$branch',
						totalOrders: { $addToSet: '$_id' },
					},
				},
				{
					$project: {
						branch: '$_id',
						totalOrders: { $size: '$totalOrders' },
					},
				},
			])

			// Calculate trends and format response
			const branchAnalytics = currentPeriodAnalytics.map(current => {
				const previous = previousPeriodAnalytics.find(
					p => p.branch === current.branch
				)
				const previousOrders = previous ? previous.totalOrders : 0
				const weeklyTrend =
					previousOrders > 0
						? Math.round(
								((current.totalOrders - previousOrders) / previousOrders) * 100
						  )
						: current.totalOrders > 0
						? 100
						: 0

				// Calculate top products for this branch
				const productMap = new Map()
				current.products.forEach(product => {
					if (productMap.has(product.name)) {
						const existing = productMap.get(product.name)
						existing.quantity += product.quantity
						existing.value += product.value
					} else {
						productMap.set(product.name, {
							name: product.name,
							quantity: product.quantity,
							value: product.value,
						})
					}
				})

				const mostOrderedProducts = Array.from(productMap.values())
					.sort((a, b) => b.quantity - a.quantity)
					.slice(0, 5)

				return {
					branch: current.branch,
					totalOrders: current.totalOrders,
					totalValue: current.totalValue || 0,
					avgOrderValue: current.avgOrderValue || 0,
					pendingOrders: current.pendingOrders || 0,
					completedOrders: current.completedOrders || 0,
					mostOrderedProducts,
					weeklyTrend,
				}
			})

			res.json({ branches: branchAnalytics })
		} catch (error) {
			console.error('Get branch analytics error:', error)
			res
				.status(500)
				.json({ message: 'Server error fetching branch analytics' })
		}
	}
)

// Get product insights (admin/editor only)
router.get(
	'/analytics/products',
	authenticate,
	requireAdminOrEditor,
	async (req, res) => {
		try {
			const { timeframe = 'week' } = req.query

			// Calculate date range based on timeframe
			const now = new Date()
			let startDate = new Date()
			let previousStartDate = new Date()

			switch (timeframe) {
				case 'day':
					startDate.setDate(now.getDate() - 1)
					previousStartDate.setDate(now.getDate() - 2)
					break
				case 'week':
					startDate.setDate(now.getDate() - 7)
					previousStartDate.setDate(now.getDate() - 14)
					break
				case 'month':
					startDate.setMonth(now.getMonth() - 1)
					previousStartDate.setMonth(now.getMonth() - 2)
					break
				case 'quarter':
					startDate.setMonth(now.getMonth() - 3)
					previousStartDate.setMonth(now.getMonth() - 6)
					break
				default:
					startDate.setDate(now.getDate() - 7)
					previousStartDate.setDate(now.getDate() - 14)
			}

			// Get current period product analytics
			const currentProductAnalytics = await Order.aggregate([
				{
					$match: {
						createdAt: { $gte: startDate, $lte: now },
					},
				},
				{
					$unwind: '$items',
				},
				{
					$lookup: {
						from: 'products',
						localField: 'items.product',
						foreignField: '_id',
						as: 'productDetails',
					},
				},
				{
					$unwind: '$productDetails',
				},
				{
					$group: {
						_id: '$items.product',
						name: { $first: '$productDetails.name' },
						totalOrdered: { $sum: '$items.quantity' },
						totalValue: {
							$sum: { $multiply: ['$items.quantity', '$productDetails.price'] },
						},
						orderCount: { $sum: 1 },
						avgPrice: { $first: '$productDetails.price' },
					},
				},
				{
					$project: {
						name: 1,
						totalOrdered: 1,
						totalValue: 1,
						frequency: '$orderCount',
						avgPrice: 1,
					},
				},
				{
					$sort: { totalOrdered: -1 },
				},
				{
					$limit: 20,
				},
			])

			// Get previous period for trend calculation
			const previousProductAnalytics = await Order.aggregate([
				{
					$match: {
						createdAt: { $gte: previousStartDate, $lt: startDate },
					},
				},
				{
					$unwind: '$items',
				},
				{
					$group: {
						_id: '$items.product',
						totalOrdered: { $sum: '$items.quantity' },
					},
				},
			])

			// Calculate trends
			const productInsights = currentProductAnalytics.map(current => {
				const previous = previousProductAnalytics.find(
					p => p._id.toString() === current._id.toString()
				)
				const previousOrdered = previous ? previous.totalOrdered : 0

				let trend = 'stable'
				if (previousOrdered === 0 && current.totalOrdered > 0) {
					trend = 'up'
				} else if (previousOrdered > 0) {
					const changePercent =
						((current.totalOrdered - previousOrdered) / previousOrdered) * 100
					if (changePercent > 10) trend = 'up'
					else if (changePercent < -10) trend = 'down'
				}

				return {
					name: current.name,
					totalOrdered: current.totalOrdered,
					totalValue: current.totalValue || 0,
					frequency: current.frequency,
					avgPrice: current.avgPrice || 0,
					trend,
				}
			})

			res.json({ products: productInsights })
		} catch (error) {
			console.error('Get product insights error:', error)
			res
				.status(500)
				.json({ message: 'Server error fetching product insights' })
		}
	}
)

// Get financial metrics (admin/editor only)
router.get(
	'/analytics/financial',
	authenticate,
	requireAdminOrEditor,
	async (req, res) => {
		try {
			const { timeframe = 'week' } = req.query

			const now = new Date()
			const startOfToday = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate()
			)
			const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

			// Calculate financial metrics
			const [dailySpending, weeklySpending, monthlySpending, branchSpending] =
				await Promise.all([
					// Daily spending
					Order.aggregate([
						{
							$match: {
								createdAt: { $gte: startOfToday },
								status: { $in: ['pending', 'approved', 'completed'] },
							},
						},
						{
							$unwind: '$items',
						},
						{
							$lookup: {
								from: 'products',
								localField: 'items.product',
								foreignField: '_id',
								as: 'productDetails',
							},
						},
						{
							$unwind: '$productDetails',
						},
						{
							$group: {
								_id: null,
								total: {
									$sum: {
										$multiply: ['$items.quantity', '$productDetails.price'],
									},
								},
							},
						},
					]),
					// Weekly spending
					Order.aggregate([
						{
							$match: {
								createdAt: { $gte: startOfWeek },
								status: { $in: ['pending', 'approved', 'completed'] },
							},
						},
						{
							$unwind: '$items',
						},
						{
							$lookup: {
								from: 'products',
								localField: 'items.product',
								foreignField: '_id',
								as: 'productDetails',
							},
						},
						{
							$unwind: '$productDetails',
						},
						{
							$group: {
								_id: null,
								total: {
									$sum: {
										$multiply: ['$items.quantity', '$productDetails.price'],
									},
								},
							},
						},
					]),
					// Monthly spending
					Order.aggregate([
						{
							$match: {
								createdAt: { $gte: startOfMonth },
								status: { $in: ['pending', 'approved', 'completed'] },
							},
						},
						{
							$unwind: '$items',
						},
						{
							$lookup: {
								from: 'products',
								localField: 'items.product',
								foreignField: '_id',
								as: 'productDetails',
							},
						},
						{
							$unwind: '$productDetails',
						},
						{
							$group: {
								_id: null,
								total: {
									$sum: {
										$multiply: ['$items.quantity', '$productDetails.price'],
									},
								},
							},
						},
					]),
					// Branch spending
					Order.aggregate([
						{
							$match: {
								createdAt: { $gte: startOfMonth },
								status: { $in: ['pending', 'approved', 'completed'] },
							},
						},
						{
							$unwind: '$items',
						},
						{
							$lookup: {
								from: 'products',
								localField: 'items.product',
								foreignField: '_id',
								as: 'productDetails',
							},
						},
						{
							$unwind: '$productDetails',
						},
						{
							$group: {
								_id: '$branch',
								spending: {
									$sum: {
										$multiply: ['$items.quantity', '$productDetails.price'],
									},
								},
							},
						},
						{
							$project: {
								branch: '$_id',
								spending: 1,
								_id: 0,
							},
						},
						{
							$sort: { spending: -1 },
						},
					]),
				])

			// Calculate average order value
			const totalOrders = await Order.countDocuments({
				createdAt: { $gte: startOfMonth },
				status: { $in: ['pending', 'approved', 'completed'] },
			})

			// Calculate previous period for growth comparison
			const startOfYesterday = new Date(
				startOfToday.getTime() - 24 * 60 * 60 * 1000
			)
			const startOfPreviousWeek = new Date(
				now.getTime() - 14 * 24 * 60 * 60 * 1000
			)
			const startOfPreviousMonth = new Date(
				now.getFullYear(),
				now.getMonth() - 1,
				1
			)
			const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)

			// Get previous period data for growth calculation
			const [
				previousDailySpending,
				previousWeeklySpending,
				previousMonthlySpending,
			] = await Promise.all([
				// Previous daily spending
				Order.aggregate([
					{
						$match: {
							createdAt: { $gte: startOfYesterday, $lt: startOfToday },
							status: { $in: ['approved', 'completed'] },
						},
					},
					{ $unwind: '$items' },
					{
						$lookup: {
							from: 'products',
							localField: 'items.product',
							foreignField: '_id',
							as: 'productDetails',
						},
					},
					{ $unwind: '$productDetails' },
					{
						$group: {
							_id: null,
							total: {
								$sum: {
									$multiply: ['$items.quantity', '$productDetails.price'],
								},
							},
						},
					},
				]),
				// Previous weekly spending
				Order.aggregate([
					{
						$match: {
							createdAt: { $gte: startOfPreviousWeek, $lt: startOfWeek },
							status: { $in: ['approved', 'completed'] },
						},
					},
					{ $unwind: '$items' },
					{
						$lookup: {
							from: 'products',
							localField: 'items.product',
							foreignField: '_id',
							as: 'productDetails',
						},
					},
					{ $unwind: '$productDetails' },
					{
						$group: {
							_id: null,
							total: {
								$sum: {
									$multiply: ['$items.quantity', '$productDetails.price'],
								},
							},
						},
					},
				]),
				// Previous monthly spending
				Order.aggregate([
					{
						$match: {
							createdAt: {
								$gte: startOfPreviousMonth,
								$lte: endOfPreviousMonth,
							},
							status: { $in: ['approved', 'completed'] },
						},
					},
					{ $unwind: '$items' },
					{
						$lookup: {
							from: 'products',
							localField: 'items.product',
							foreignField: '_id',
							as: 'productDetails',
						},
					},
					{ $unwind: '$productDetails' },
					{
						$group: {
							_id: null,
							total: {
								$sum: {
									$multiply: ['$items.quantity', '$productDetails.price'],
								},
							},
						},
					},
				]),
			])

			// Calculate growth percentages
			const calculateGrowth = (current, previous) => {
				if (!previous || previous === 0) return current > 0 ? 100 : 0
				return ((current - previous) / previous) * 100
			}

			const monthlyTotal = monthlySpending[0]?.total || 0
			const avgOrderValue = totalOrders > 0 ? monthlyTotal / totalOrders : 0
			const currentDaily = dailySpending[0]?.total || 0
			const currentWeekly = weeklySpending[0]?.total || 0
			const prevDaily = previousDailySpending[0]?.total || 0
			const prevWeekly = previousWeeklySpending[0]?.total || 0
			const prevMonthly = previousMonthlySpending[0]?.total || 0

			res.json({
				// Current metrics
				dailySpending: currentDaily,
				weeklySpending: currentWeekly,
				monthlySpending: monthlyTotal,
				avgOrderValue,

				// Growth metrics with real historical data
				dailyGrowth: calculateGrowth(currentDaily, prevDaily),
				weeklyGrowth: calculateGrowth(currentWeekly, prevWeekly),
				monthlyGrowth: calculateGrowth(monthlyTotal, prevMonthly),
				avgOrderGrowth:
					totalOrders > 0
						? calculateGrowth(
								avgOrderValue,
								prevMonthly / Math.max(totalOrders, 1)
						  )
						: 0,

				// Previous period data for comparison
				previousPeriod: {
					dailySpending: prevDaily,
					weeklySpending: prevWeekly,
					monthlySpending: prevMonthly,
				},

				// Additional insights
				totalOrders,
				topSpendingBranches: branchSpending || [],

				// Status breakdown
				statusBreakdown: {
					completed: monthlyTotal,
					pending: 0, // Will be calculated if needed
				},
			})
		} catch (error) {
			console.error('Get financial metrics error:', error)
			res
				.status(500)
				.json({ message: 'Server error fetching financial metrics' })
		}
	}
)

module.exports = router
