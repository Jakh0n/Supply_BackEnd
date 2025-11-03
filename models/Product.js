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
				'store-supplies', // 매장 용품 (Dukkan Malz.)
				'food-products', // 식량품 (Gidalar)
				'cleaning-materials', // 청소용품 (Temizlik Malz.)
				'frozen-products', // 냉동 체품 (Donuk Malz.)
				'others', // 기타 (Diger)
				'beverages', // 음료 (Icecek)
				'packaging-materials', // 포장지 (Paket Malz.)
			],
			default: 'food-products',
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
		price: {
			type: Number,
			required: [true, 'Product price is required'],
			min: [0, 'Price cannot be negative'],
			validate: {
				validator: function (value) {
					return Number.isFinite(value) && value >= 0
				},
				message: 'Price must be a valid positive number',
			},
		},
		amount: {
			type: Number,
			default: 0,
			min: [0, 'Amount cannot be negative'],
		},
		count: {
			type: Number,
			default: 0,
			min: [0, 'Count cannot be negative'],
		},
		purchaseSite: {
			type: String,
			trim: true,
			maxlength: [200, 'Purchase site cannot exceed 200 characters'],
		},
		contact: {
			type: String,
			trim: true,
			maxlength: [100, 'Contact information cannot exceed 100 characters'],
		},
		monthlyUsage: {
			type: Number,
			default: 0,
			min: [0, 'Monthly usage cannot be negative'],
		},
		images: [
			{
				url: {
					type: String,
					required: true,
				},
				publicId: {
					type: String,
					required: true,
				},
				isPrimary: {
					type: Boolean,
					default: false,
				},
			},
		],
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
