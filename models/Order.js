const mongoose = require('mongoose')

const orderItemSchema = new mongoose.Schema({
	product: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Product',
		required: true,
	},
	quantity: {
		type: Number,
		required: [true, 'Quantity is required'],
		min: [1, 'Quantity must be at least 1'],
	},
	notes: {
		type: String,
		trim: true,
		maxlength: [200, 'Notes cannot exceed 200 characters'],
	},
})

const orderSchema = new mongoose.Schema(
	{
		orderNumber: {
			type: String,
			unique: true,
			required: false,
		},
		worker: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		branch: {
			type: String,
			required: [true, 'Branch is required'],
			trim: true,
		},
		requestedDate: {
			type: Date,
			required: [true, 'Requested date is required'],
		},
		items: [orderItemSchema],
		status: {
			type: String,
			enum: ['pending', 'approved', 'rejected', 'completed'],
			default: 'pending',
		},
		notes: {
			type: String,
			trim: true,
			maxlength: [500, 'Notes cannot exceed 500 characters'],
		},
		adminNotes: {
			type: String,
			trim: true,
			maxlength: [500, 'Admin notes cannot exceed 500 characters'],
		},
		processedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
		processedAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
)

// Generate order number before saving
orderSchema.pre('save', async function (next) {
	if (!this.orderNumber) {
		try {
			console.log('Generating order number...')

			// Simple timestamp-based order number that doesn't require DB queries
			const now = new Date()
			const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
			const timeStr = now.getTime().toString().slice(-6) // Last 6 digits of timestamp

			this.orderNumber = `ORD-${dateStr}-${timeStr}`

			console.log('Generated order number:', this.orderNumber)
		} catch (error) {
			console.error('Error in orderNumber generation:', error)
			// Ultimate fallback
			const timestamp = Date.now().toString().slice(-8)
			this.orderNumber = `ORD-${timestamp}`
			console.log('Using fallback order number:', this.orderNumber)
		}
	}

	console.log('Final order number before save:', this.orderNumber)
	next()
})

// Index for better query performance
orderSchema.index({ branch: 1, requestedDate: 1 })
orderSchema.index({ worker: 1, createdAt: -1 })
orderSchema.index({ status: 1, requestedDate: 1 })

module.exports = mongoose.model('Order', orderSchema)
