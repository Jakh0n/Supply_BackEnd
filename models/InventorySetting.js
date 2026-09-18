const mongoose = require('mongoose')

const inventorySettingSchema = new mongoose.Schema(
	{
		key: {
			type: String,
			enum: ['global'],
			default: 'global',
			unique: true,
			immutable: true,
		},
		status: {
			type: String,
			enum: ['setup', 'active'],
			default: 'setup',
		},
		activatedAt: {
			type: Date,
			default: null,
		},
		activatedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
	},
	{ timestamps: true }
)

module.exports = mongoose.model('InventorySetting', inventorySettingSchema)
