const express = require('express')
const ProductPurchase = require('../models/ProductPurchase')
const { authenticate } = require('../middleware/auth')
const {
	cloudinary,
	upload,
	uploadToCloudinary,
} = require('../config/cloudinary')
const router = express.Router()

// Create a new product purchase
router.post('/', authenticate, async (req, res) => {
	try {
		console.log('Purchase creation request:', req.body)
		console.log('User:', req.user)

		// Only admin can create purchase requests
		if (req.user.position !== 'admin') {
			return res.status(403).json({
				message:
					'Access denied. Only administrators can create purchase requests.',
			})
		}

		const {
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
		} = req.body

		// Validate required fields
		const requiredFields = [
			'category',
			'productName',
			'price',
			'providerName',
			'paymentWay',
			'quantity',
			'unit',
			'branch',
		]
		const missingFields = requiredFields.filter(field => !req.body[field])
		console.log('Missing fields:', missingFields)
		console.log('Field values:', {
			category: req.body.category,
			productName: req.body.productName,
			price: req.body.price,
			providerName: req.body.providerName,
			paymentWay: req.body.paymentWay,
			quantity: req.body.quantity,
			unit: req.body.unit,
			branch: req.body.branch,
		})

		if (missingFields.length > 0) {
			return res.status(400).json({
				message: 'Missing required fields',
				missingFields,
			})
		}

		// Calculate total amount
		const calculatedPrice = parseFloat(price)
		const calculatedQuantity = parseInt(quantity)
		const totalAmount = calculatedPrice * calculatedQuantity

		console.log('Calculated values:', {
			price: calculatedPrice,
			quantity: calculatedQuantity,
			totalAmount,
		})

		const productPurchase = new ProductPurchase({
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
			createdBy: req.user.id,
		})

		await productPurchase.save()

		// Populate the createdBy field for response
		await productPurchase.populate('createdBy', 'username')

		res.status(201).json({
			message: 'Product purchase created successfully',
			data: productPurchase,
		})
	} catch (error) {
		console.error('Error creating product purchase:', error)
		console.error('Error details:', {
			name: error.name,
			message: error.message,
			errors: error.errors,
		})
		if (error.name === 'ValidationError') {
			const validationErrors = Object.keys(error.errors).map(key => ({
				field: key,
				message: error.errors[key].message,
			}))
			console.log('Validation errors:', validationErrors)
			return res.status(400).json({
				message: 'Validation error',
				errors: validationErrors,
			})
		}
		res.status(500).json({ message: 'Internal server error' })
	}
})

// Get all product purchases with filtering and pagination
router.get('/', authenticate, async (req, res) => {
	try {
		console.log('Fetching purchases - User:', req.user)
		console.log('Query params:', req.query)

		// Only admin can view purchase requests
		if (req.user.position !== 'admin') {
			return res.status(403).json({
				message:
					'Access denied. Only administrators can view purchase requests.',
			})
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
		} = req.query

		// Build filter object
		const filter = {}

		if (category && category !== 'all') {
			filter.category = category
		}

		if (branch && branch !== 'all') {
			filter.branch = branch
		}

		if (status && status !== 'all') {
			filter.status = status
		}

		if (paymentWay && paymentWay !== 'all') {
			filter.paymentWay = paymentWay
		}

		// Date range filter
		if (startDate || endDate) {
			filter.date = {}
			if (startDate) {
				filter.date.$gte = new Date(startDate)
			}
			if (endDate) {
				filter.date.$lte = new Date(endDate)
			}
		}

		// Search filter
		if (search) {
			filter.$or = [
				{ productName: { $regex: search, $options: 'i' } },
				{ providerName: { $regex: search, $options: 'i' } },
				{ notes: { $regex: search, $options: 'i' } },
			]
		}

		// Calculate pagination
		const skip = (parseInt(page) - 1) * parseInt(limit)

		// Get purchases with pagination
		const purchases = await ProductPurchase.find(filter)
			.populate('createdBy', 'username')
			.sort({ date: -1 })
			.skip(skip)
			.limit(parseInt(limit))

		// Get total count for pagination
		const total = await ProductPurchase.countDocuments(filter)

		console.log('Found purchases:', purchases.length)
		console.log('Total count:', total)
		console.log('Filter used:', filter)

		res.json({
			data: {
				purchases,
				pagination: {
					current: parseInt(page),
					pages: Math.ceil(total / parseInt(limit)),
					total,
				},
			},
		})
	} catch (error) {
		console.error('Error fetching product purchases:', error)
		res.status(500).json({ message: 'Internal server error' })
	}
})

// Get a single product purchase by ID
router.get('/:id', authenticate, async (req, res) => {
	try {
		// Only admin can view purchase requests
		if (req.user.position !== 'admin') {
			return res.status(403).json({
				message:
					'Access denied. Only administrators can view purchase requests.',
			})
		}

		const purchase = await ProductPurchase.findById(req.params.id).populate(
			'createdBy',
			'username'
		)

		if (!purchase) {
			return res.status(404).json({ message: 'Product purchase not found' })
		}

		res.json({ data: purchase })
	} catch (error) {
		console.error('Error fetching product purchase:', error)
		if (error.name === 'CastError') {
			return res.status(404).json({ message: 'Product purchase not found' })
		}
		res.status(500).json({ message: 'Internal server error' })
	}
})

// Update a product purchase
router.put('/:id', authenticate, async (req, res) => {
	try {
		// Only admin can update purchase requests
		if (req.user.position !== 'admin') {
			return res.status(403).json({
				message:
					'Access denied. Only administrators can update purchase requests.',
			})
		}

		const {
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
			status,
			images,
		} = req.body

		const updateData = {}

		// Only update provided fields
		if (date !== undefined) updateData.date = date
		if (category !== undefined) updateData.category = category
		if (productName !== undefined) updateData.productName = productName
		if (price !== undefined) updateData.price = parseFloat(price)
		if (providerName !== undefined) updateData.providerName = providerName
		if (paymentWay !== undefined) updateData.paymentWay = paymentWay
		if (quantity !== undefined) updateData.quantity = parseInt(quantity)
		if (unit !== undefined) updateData.unit = unit
		if (notes !== undefined) updateData.notes = notes
		if (branch !== undefined) updateData.branch = branch
		if (status !== undefined) updateData.status = status
		if (images !== undefined) updateData.images = images

		const purchase = await ProductPurchase.findByIdAndUpdate(
			req.params.id,
			updateData,
			{
				new: true,
				runValidators: true,
			}
		).populate('createdBy', 'username')

		if (!purchase) {
			return res.status(404).json({ message: 'Product purchase not found' })
		}

		res.json({
			message: 'Product purchase updated successfully',
			data: purchase,
		})
	} catch (error) {
		console.error('Error updating product purchase:', error)
		if (error.name === 'ValidationError') {
			const validationErrors = Object.keys(error.errors).map(key => ({
				field: key,
				message: error.errors[key].message,
			}))
			return res.status(400).json({
				message: 'Validation error',
				errors: validationErrors,
			})
		}
		if (error.name === 'CastError') {
			return res.status(404).json({ message: 'Product purchase not found' })
		}
		res.status(500).json({ message: 'Internal server error' })
	}
})

// Delete a product purchase
router.delete('/:id', authenticate, async (req, res) => {
	try {
		// Only admin can delete purchase requests
		if (req.user.position !== 'admin') {
			return res.status(403).json({
				message:
					'Access denied. Only administrators can delete purchase requests.',
			})
		}

		const purchase = await ProductPurchase.findByIdAndDelete(req.params.id)

		if (!purchase) {
			return res.status(404).json({ message: 'Product purchase not found' })
		}

		res.json({ message: 'Product purchase deleted successfully' })
	} catch (error) {
		console.error('Error deleting product purchase:', error)
		if (error.name === 'CastError') {
			return res.status(404).json({ message: 'Product purchase not found' })
		}
		res.status(500).json({ message: 'Internal server error' })
	}
})

// Get purchase statistics
router.get('/stats/summary', authenticate, async (req, res) => {
	try {
		// Only admin can view stats
		if (req.user.position !== 'admin') {
			return res.status(403).json({
				message:
					'Access denied. Only administrators can view purchase statistics.',
			})
		}

		const { startDate, endDate, branch } = req.query

		// Build filter for date range
		const dateFilter = {}
		if (startDate || endDate) {
			dateFilter.date = {}
			if (startDate) {
				dateFilter.date.$gte = new Date(startDate)
			}
			if (endDate) {
				dateFilter.date.$lte = new Date(endDate)
			}
		}

		// Add branch filter if specified
		if (branch && branch !== 'all') {
			dateFilter.branch = branch
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
				{ $group: { _id: null, total: { $sum: '$totalAmount' } } },
			]),
			ProductPurchase.aggregate([
				{ $match: dateFilter },
				{ $group: { _id: '$status', count: { $sum: 1 } } },
			]),
			ProductPurchase.aggregate([
				{ $match: dateFilter },
				{
					$group: {
						_id: '$category',
						count: { $sum: 1 },
						totalAmount: { $sum: '$totalAmount' },
					},
				},
			]),
			ProductPurchase.find(dateFilter)
				.populate('createdBy', 'username')
				.sort({ createdAt: -1 })
				.limit(5),
		])

		res.json({
			data: {
				totalPurchases,
				totalAmount: totalAmount[0]?.total || 0,
				statusBreakdown,
				categoryBreakdown,
				recentPurchases,
			},
		})
	} catch (error) {
		console.error('Error fetching purchase statistics:', error)
		res.status(500).json({ message: 'Internal server error' })
	}
})

// Upload images to Cloudinary (admin only)
router.post(
	'/upload-images',
	authenticate,
	upload.array('images', 5), // Allow up to 5 images
	async (req, res) => {
		try {
			// Only admin can upload images
			if (req.user.position !== 'admin') {
				return res.status(403).json({
					message: 'Access denied. Only administrators can upload images.',
				})
			}

			if (!req.files || req.files.length === 0) {
				return res.status(400).json({ message: 'No images provided' })
			}

			// Upload each file to Cloudinary
			const uploadPromises = req.files.map(async file => {
				const result = await uploadToCloudinary(file.buffer)
				return {
					url: result.secure_url,
					publicId: result.public_id,
					isPrimary: false,
				}
			})

			const uploadedImages = await Promise.all(uploadPromises)

			// Set first image as primary by default
			if (uploadedImages.length > 0) {
				uploadedImages[0].isPrimary = true
			}

			res.json({
				message: 'Images uploaded successfully',
				images: uploadedImages,
			})
		} catch (error) {
			console.error('Error uploading images:', error)
			res.status(500).json({ message: 'Internal server error' })
		}
	}
)

module.exports = router
