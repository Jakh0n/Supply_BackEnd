const mongoose = require('mongoose')

const MOVEMENT_TYPES = [
	'purchase-in',
	'order-out',
	'drink-order-out',
	'reversal-in',
	'reversal-out',
	'manual-in',
	'manual-out',
	'adjustment-in',
	'adjustment-out',
]

const SOURCE_TYPES = ['ProductPurchase', 'Order', 'DrinkOrder', 'Manual']

const stockMovementSchema = new mongoose.Schema(
	{
		product: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Product',
			required: true,
		},
		productName: {
			type: String,
			required: true,
			trim: true,
		},
		unit: {
			type: String,
			required: true,
			trim: true,
		},
		type: {
			type: String,
			enum: MOVEMENT_TYPES,
			required: true,
		},
		quantity: {
			type: Number,
			required: true,
			min: [0.000001, 'Quantity must be greater than zero'],
		},
		delta: {
			type: Number,
			required: true,
			validate: {
				validator: value => Number.isFinite(value) && value !== 0,
				message: 'Delta must be a non-zero number',
			},
		},
		balanceBefore: {
			type: Number,
			required: true,
			min: 0,
		},
		balanceAfter: {
			type: Number,
			required: true,
			min: 0,
		},
		sourceType: {
			type: String,
			enum: SOURCE_TYPES,
			required: true,
		},
		sourceId: {
			type: mongoose.Schema.Types.ObjectId,
			required: true,
		},
		sourceVersion: {
			type: Number,
			required: true,
			min: 1,
		},
		idempotencyKey: {
			type: String,
			required: true,
			unique: true,
		},
		branch: {
			type: String,
			trim: true,
			default: 'main',
		},
		reason: {
			type: String,
			required: true,
			trim: true,
			maxlength: 500,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
	},
	{ timestamps: true }
)

stockMovementSchema.index({ product: 1, createdAt: -1 })
stockMovementSchema.index({ type: 1, createdAt: -1 })
stockMovementSchema.index({ sourceType: 1, sourceId: 1 })
stockMovementSchema.index({ createdAt: -1 })

module.exports = mongoose.model('StockMovement', stockMovementSchema)
module.exports.MOVEMENT_TYPES = MOVEMENT_TYPES
