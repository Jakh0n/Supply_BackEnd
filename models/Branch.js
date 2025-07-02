const mongoose = require('mongoose')

const branchSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			maxlength: 100,
		},
		description: {
			type: String,
			trim: true,
			maxlength: 500,
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

// Index for faster queries
branchSchema.index({ name: 1 })
branchSchema.index({ isActive: 1 })

module.exports = mongoose.model('Branch', branchSchema)
