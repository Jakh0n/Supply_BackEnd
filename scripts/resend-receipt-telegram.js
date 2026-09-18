/**
 * Resend Telegram alert for an order that already has hasDiscrepancy=true.
 * Usage: node scripts/resend-receipt-telegram.js ORD-20260917-006
 */
require('dotenv').config()
const mongoose = require('mongoose')
require('../models/Product')
require('../models/User')
const Order = require('../models/Order')
const { notifyReceiptDiscrepancy } = require('../services/orderReceiptNotification')
const { isTelegramConfigured } = require('../services/telegramService')

async function main() {
	const orderNumber = process.argv[2]
	if (!orderNumber) {
		console.error('Usage: node scripts/resend-receipt-telegram.js <orderNumber>')
		process.exit(1)
	}

	if (!isTelegramConfigured()) {
		console.error('Telegram is not configured in backend/.env')
		process.exit(1)
	}

	await mongoose.connect(process.env.MONGODB_URI)
	const order = await Order.findOne({ orderNumber })
		.populate('items.product', 'name unit category')
		.populate('checkedBy', 'username')

	if (!order) {
		console.error('Order not found:', orderNumber)
		process.exit(1)
	}

	if (!order.hasDiscrepancy) {
		console.error('Order has no discrepancy — nothing to alert')
		process.exit(1)
	}

	const result = await notifyReceiptDiscrepancy(order, { orderType: 'supply' })
	console.log('Sent to', result.sent, 'admin(s)')
	await mongoose.disconnect()
}

main().catch(error => {
	console.error(error.message)
	process.exit(1)
})
