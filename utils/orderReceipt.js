const { getWorkerBranch } = require('./workerBranch')

const RECEIPT_ELIGIBLE_STATUSES = new Set(['completed'])

function resolveItemReceiptStatus(orderedQuantity, receivedQuantity) {
	if (receivedQuantity >= orderedQuantity) return 'received'
	if (receivedQuantity === 0) return 'missing'
	return 'partial'
}

function resolveOrderReceiptStatus(items) {
	const statuses = items.map(item => item.itemReceiptStatus)
	if (statuses.every(status => status === 'received')) return 'received'
	return 'partial'
}

function workerMatchesOrderBranch(user, order) {
	const workerBranch = getWorkerBranch(user)
	if (!workerBranch || !order?.branch) return false
	return workerBranch === order.branch.trim()
}

function workerCanSubmitReceipt(user, order) {
	if (!user || user.position !== 'worker') return false
	if (!RECEIPT_ELIGIBLE_STATUSES.has(order.status)) return false
	if (order.receiptStatus && order.receiptStatus !== 'pending') return false
	return workerMatchesOrderBranch(user, order)
}

function workerCanViewOrder(user, order) {
	if (['admin', 'editor'].includes(user?.position)) return true
	if (user?.position !== 'worker') return false

	const workerId = user._id.toString()
	const orderWorkerId =
		order.worker?._id?.toString?.() || order.worker?.toString?.()
	if (orderWorkerId === workerId) return true

	return (
		RECEIPT_ELIGIBLE_STATUSES.has(order.status) &&
		workerMatchesOrderBranch(user, order)
	)
}

function getOrderProductId(item) {
	return item.product?._id?.toString?.() || item.product?.toString?.()
}

function applyReceiptToOrder(order, receiptPayload, userId) {
	const { items: receiptItems, receiptNotes } = receiptPayload
	const receiptByProduct = new Map(
		receiptItems.map(entry => [entry.productId.toString(), entry])
	)

	if (receiptByProduct.size !== order.items.length) {
		const error = new Error('Receipt must include every order item')
		error.statusCode = 400
		throw error
	}

	let hasDiscrepancy = false

	for (const item of order.items) {
		const productId = getOrderProductId(item)
		const receipt = receiptByProduct.get(productId)
		if (!receipt) {
			const error = new Error('Receipt item does not belong to this order')
			error.statusCode = 400
			throw error
		}

		const receivedQuantity = Number(receipt.receivedQuantity)
		if (!Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
			const error = new Error('Received quantity must be zero or greater')
			error.statusCode = 400
			throw error
		}
		if (receivedQuantity > item.quantity) {
			const error = new Error(
				'Received quantity cannot exceed the ordered quantity'
			)
			error.statusCode = 400
			throw error
		}

		item.receivedQuantity = receivedQuantity
		item.itemReceiptStatus = resolveItemReceiptStatus(
			item.quantity,
			receivedQuantity
		)
		item.discrepancyNotes = receipt.discrepancyNotes?.trim() || undefined

		if (receivedQuantity < item.quantity) {
			hasDiscrepancy = true
		}
	}

	order.receiptStatus = resolveOrderReceiptStatus(order.items)
	order.hasDiscrepancy = hasDiscrepancy
	order.receiptNotes = receiptNotes?.trim() || undefined
	order.checkedBy = userId
	order.checkedAt = new Date()

	return order
}

module.exports = {
	RECEIPT_ELIGIBLE_STATUSES,
	resolveItemReceiptStatus,
	resolveOrderReceiptStatus,
	workerCanSubmitReceipt,
	workerCanViewOrder,
	workerMatchesOrderBranch,
	applyReceiptToOrder,
	getOrderProductId,
}
