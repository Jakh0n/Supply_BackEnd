const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, 'Product name is required'],
			trim: true,
			maxlength: [100, 'Product name cannot exceed 100 characters'],
		},
		category: {
			type: String,
			required: [true, 'Product category is required'],
			enum: [
				'food',
				'beverages',
				'cleaning',
				'equipment',
				'packaging',
				'other',
			],
			default: 'other',
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
		description: {
			type: String,
			trim: true,
			maxlength: [500, 'Description cannot exceed 500 characters'],
		},
		supplier: {
			type: String,
			trim: true,
			maxlength: [100, 'Supplier name cannot exceed 100 characters'],
		},
		isActive: {
			type: Boolean,
			default: true,
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

// Index for better search performance
productSchema.index({ name: 'text', category: 1 })

module.exports = mongoose.model('Product', productSchema)
