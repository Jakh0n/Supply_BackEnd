const Product = require('../models/Product')

function getProductId(productRef) {
	if (!productRef) return null
	if (typeof productRef === 'string') return productRef
	if (productRef._id) return String(productRef._id)
	return String(productRef)
}

/**
 * Increase on-hand stock (Product.amount). Reactivates product when stock > 0.
 */
async function addStock(productId, quantity) {
	const qty = Number(quantity)
	if (!Number.isFinite(qty) || qty <= 0) {
		throw new Error('Quantity must be a positive number')
	}

	const product = await Product.findById(productId)
	if (!product) {
		throw new Error('Product not found')
	}

	product.amount = (product.amount || 0) + qty
	if (product.amount > 0) {
		product.isActive = true
	}
	await product.save()
	return product
}

/**
 * Deduct stock for order line items. Clamps at 0; marks sold out when empty.
 */
async function deductItems(items) {
	if (!Array.isArray(items) || items.length === 0) return

	const totals = new Map()
	for (const item of items) {
		const productId = getProductId(item.product)
		const qty = Number(item.quantity)
		if (!productId || !Number.isFinite(qty) || qty <= 0) continue
		totals.set(productId, (totals.get(productId) || 0) + qty)
	}

	for (const [productId, qty] of totals) {
		const product = await Product.findById(productId)
		if (!product) continue

		product.amount = Math.max(0, (product.amount || 0) - qty)
		if (product.amount === 0) {
			product.isActive = false
		}
		await product.save()
	}
}

/**
 * Deduct stock only when an order first becomes completed.
 */
async function maybeDeductForCompletion(orderDoc, previousStatus, nextStatus) {
	if (nextStatus !== 'completed' || previousStatus === 'completed') {
		return
	}
	await deductItems(orderDoc.items || [])
}

/**
 * For bulk completions: deduct stock for each non-completed order, then return their ids.
 */
async function deductForOrdersBecomingCompleted(orders) {
	const toComplete = []
	for (const order of orders) {
		if (order.status === 'completed') continue
		await deductItems(order.items || [])
		toComplete.push(order._id)
	}
	return toComplete
}

module.exports = {
	addStock,
	deductItems,
	maybeDeductForCompletion,
	deductForOrdersBecomingCompleted,
}
