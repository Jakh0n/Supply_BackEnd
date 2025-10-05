const mongoose = require('mongoose')

const productPurchaseSchema = new mongoose.Schema(
	{
		date: {
			type: Date,
			required: [true, 'Purchase date is required'],
			default: Date.now,
		},
		category: {
			type: String,
			required: [true, 'Product category is required'],
			enum: [
				'frozen-products',
				'main-products',
				'desserts',
				'drinks',
				'packaging-materials',
				'cleaning-materials',
			],
		},
		productName: {
			type: String,
			required: [true, 'Product name is required'],
			trim: true,
			maxlength: [200, 'Product name cannot exceed 200 characters'],
		},
		price: {
			type: Number,
			required: [true, 'Product price is required'],
			min: [0.01, 'Price must be greater than 0'],
			validate: {
				validator: function (value) {
					return Number.isFinite(value) && value > 0
				},
				message: 'Price must be a valid positive number greater than 0',
			},
		},
		providerName: {
			type: String,
			required: [true, 'Provider name is required'],
			trim: true,
			maxlength: [100, 'Provider name cannot exceed 100 characters'],
		},
		paymentWay: {
			type: String,
			required: [true, 'Payment method is required'],
			enum: [
				'cash',
				'bank-transfer',
				'credit-card',
				'debit-card',
				'check',
				'installments',
				'other',
			],
			default: 'cash',
		},
		quantity: {
			type: Number,
			required: [true, 'Quantity is required'],
			min: [1, 'Quantity must be at least 1'],
		},
		unit: {
			type: String,
			required: [true, 'Unit is required'],
			enum: [
				'kg',
				'g',
				'l',
				'ml',
				'pieces',
				'boxes',
				'bottles',
				'cans',
				'packets',
			],
			default: 'pieces',
		},
		totalAmount: {
			type: Number,
			required: true,
		},
		notes: {
			type: String,
			trim: true,
			maxlength: [500, 'Notes cannot exceed 500 characters'],
		},
		branch: {
			type: String,
			required: [true, 'Branch is required'],
			trim: true,
		},
		status: {
			type: String,
			enum: ['pending', 'ordered', 'received', 'cancelled'],
			default: 'pending',
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
	},
	{
		timestamps: true,
	}
)

// Pre-save middleware to calculate total amount
productPurchaseSchema.pre('save', function (next) {
	if (this.price && this.quantity) {
		this.totalAmount = this.price * this.quantity
	}
	next()
})

// Index for better search performance
productPurchaseSchema.index({ date: -1 })
productPurchaseSchema.index({ category: 1 })
productPurchaseSchema.index({ branch: 1 })
productPurchaseSchema.index({ status: 1 })
productPurchaseSchema.index({ createdBy: 1 })

module.exports = mongoose.model('ProductPurchase', productPurchaseSchema)
