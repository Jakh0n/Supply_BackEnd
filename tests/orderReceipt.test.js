const test = require('node:test')
const assert = require('node:assert/strict')
const {
	resolveItemReceiptStatus,
	resolveOrderReceiptStatus,
	workerCanSubmitReceipt,
	applyReceiptToOrder,
} = require('../utils/orderReceipt')

test('resolveItemReceiptStatus handles full, partial, and missing quantities', () => {
	assert.equal(resolveItemReceiptStatus(5, 5), 'received')
	assert.equal(resolveItemReceiptStatus(5, 7), 'received')
	assert.equal(resolveItemReceiptStatus(5, 3), 'partial')
	assert.equal(resolveItemReceiptStatus(5, 0), 'missing')
})

test('resolveOrderReceiptStatus marks partial when any item is short', () => {
	assert.equal(
		resolveOrderReceiptStatus([
			{ itemReceiptStatus: 'received' },
			{ itemReceiptStatus: 'received' },
		]),
		'received'
	)
	assert.equal(
		resolveOrderReceiptStatus([
			{ itemReceiptStatus: 'received' },
			{ itemReceiptStatus: 'missing' },
		]),
		'partial'
	)
})

test('workerCanSubmitReceipt requires completed pending branch order', () => {
	const worker = { position: 'worker', branch: 'Gangnam', _id: '1' }
	const order = {
		status: 'completed',
		receiptStatus: 'pending',
		branch: 'Gangnam',
	}

	assert.equal(workerCanSubmitReceipt(worker, order), true)
	assert.equal(
		workerCanSubmitReceipt(worker, { ...order, status: 'approved' }),
		false
	)
	assert.equal(
		workerCanSubmitReceipt(worker, { ...order, receiptStatus: 'received' }),
		false
	)
	assert.equal(
		workerCanSubmitReceipt(worker, { ...order, branch: 'Other' }),
		false
	)
})

test('applyReceiptToOrder stores item and order receipt state', () => {
	const order = {
		items: [
			{ product: 'p1', quantity: 5, itemReceiptStatus: 'pending' },
			{ product: 'p2', quantity: 2, itemReceiptStatus: 'pending' },
		],
	}

	applyReceiptToOrder(
		order,
		{
			items: [
				{ productId: 'p1', receivedQuantity: 5 },
				{
					productId: 'p2',
					receivedQuantity: 0,
					discrepancyNotes: 'Not on truck',
				},
			],
			receiptNotes: 'One item missing',
		},
		'worker-1'
	)

	assert.equal(order.receiptStatus, 'partial')
	assert.equal(order.hasDiscrepancy, true)
	assert.equal(order.items[0].itemReceiptStatus, 'received')
	assert.equal(order.items[1].itemReceiptStatus, 'missing')
	assert.equal(order.items[1].discrepancyNotes, 'Not on truck')
	assert.equal(order.checkedBy, 'worker-1')
	assert.ok(order.checkedAt instanceof Date)
})
