const test = require('node:test')
const assert = require('node:assert/strict')
const {
	buildReceiptDiscrepancyMessage,
	getDiscrepancyItems,
} = require('../services/orderReceiptNotification')

const sampleOrder = {
	orderNumber: 'ORD-20260918-001',
	branch: 'Gangnam',
	requestedDate: new Date('2026-09-18T00:00:00.000Z'),
	checkedAt: new Date('2026-09-18T05:30:00.000Z'),
	checkedBy: { username: 'gangnam_worker' },
	receiptNotes: 'Box was damaged',
	items: [
		{
			quantity: 5,
			receivedQuantity: 5,
			itemReceiptStatus: 'received',
			product: { name: 'Flour', unit: 'kg' },
		},
		{
			quantity: 2,
			receivedQuantity: 0,
			itemReceiptStatus: 'missing',
			discrepancyNotes: 'Not on truck',
			product: { name: 'Cola', unit: 'boxes' },
		},
		{
			quantity: 10,
			receivedQuantity: 7,
			itemReceiptStatus: 'partial',
			discrepancyNotes: '3 bottles broken',
			product: { name: 'Water', unit: 'bottles' },
		},
	],
}

test('getDiscrepancyItems only returns short or missing lines', () => {
	const items = getDiscrepancyItems(sampleOrder)
	assert.equal(items.length, 2)
	assert.equal(items[0].product.name, 'Cola')
	assert.equal(items[1].product.name, 'Water')
})

test('buildReceiptDiscrepancyMessage uses HTML and accurate quantities', () => {
	const message = buildReceiptDiscrepancyMessage(sampleOrder, {
		orderType: 'supply',
	})

	assert.match(message, /<b>⚠️ SUPPLY ALERT<\/b>/)
	assert.match(message, /<b>Order:<\/b> ORD-20260918-001/)
	assert.match(message, /<b>Type:<\/b> Supply order/)
	assert.match(message, /<b>Branch:<\/b> Gangnam/)
	assert.match(message, /<b>Requested date:<\/b> 18 Sept? 2026/)
	assert.match(message, /<b>Checked by:<\/b> gangnam_worker/)
	assert.match(message, /<b>Missing \/ short items \(2\):<\/b>/)
	assert.match(message, /<b>Cola<\/b> — MISSING/)
	assert.match(message, /Ordered: 2 boxes/)
	assert.match(message, /Received: 0 boxes/)
	assert.match(message, /Short by: 2 boxes/)
	assert.match(message, /Not on truck/)
	assert.match(message, /<b>Water<\/b> — PARTIAL/)
	assert.match(message, /Short by: 3 bottles/)
	assert.match(message, /<b>Worker note:<\/b> Box was damaged/)
	assert.doesNotMatch(message, /<b>Flour<\/b>/)
})
