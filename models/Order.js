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
			required: true,
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
		const date = new Date()
		const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
		const count = await this.constructor.countDocuments({
			createdAt: {
				$gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
				$lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
			},
		})
		this.orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(3, '0')}`
	}
	next()
})

// Index for better query performance
orderSchema.index({ branch: 1, requestedDate: 1 })
orderSchema.index({ worker: 1, createdAt: -1 })
orderSchema.index({ status: 1, requestedDate: 1 })

module.exports = mongoose.model('Order', orderSchema)
