const { notifyTelegramAdmins, isTelegramConfigured } = require('./telegramService')
const { escapeHtml } = require('../utils/escapeHtml')

function getProductName(item) {
	if (typeof item.product === 'object' && item.product?.name) {
		return item.product.name
	}
	return 'Unknown product'
}

function getProductUnit(item) {
	if (typeof item.product === 'object' && item.product?.unit) {
		return item.product.unit
	}
	return 'units'
}

function formatOrderDate(value) {
	if (!value) return '—'
	return new Date(value).toLocaleDateString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function formatCheckedAt(checkedAt) {
	if (!checkedAt) return '—'
	return new Date(checkedAt).toLocaleString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	})
}

function getIssueLabel(item) {
	const status = item.itemReceiptStatus
	if (status === 'missing') return 'MISSING'
	if (status === 'partial') return 'PARTIAL'
	const received = Number(item.receivedQuantity ?? 0)
	if (received === 0) return 'MISSING'
	if (received < item.quantity) return 'PARTIAL'
	return 'ISSUE'
}

function getDiscrepancyItems(order) {
	return order.items.filter(item => {
		const received = Number(item.receivedQuantity ?? 0)
		return received < item.quantity
	})
}

function buildDiscrepancyItemBlock(item, index) {
	const received = Number(item.receivedQuantity ?? 0)
	const ordered = item.quantity
	const unit = getProductUnit(item)
	const shortBy = ordered - received
	const note = item.discrepancyNotes?.trim()
	const lines = [
		`${index + 1}. <b>${escapeHtml(getProductName(item))}</b> — ${getIssueLabel(item)}`,
		`   Ordered: ${ordered} ${escapeHtml(unit)}`,
		`   Received: ${received} ${escapeHtml(unit)}`,
		`   Short by: ${shortBy} ${escapeHtml(unit)}`,
	]

	if (note) {
		lines.push(`   Note: ${escapeHtml(note)}`)
	}

	return lines.join('\n')
}

function buildReceiptDiscrepancyMessage(order, options = {}) {
	const orderTypeLabel =
		options.orderType === 'drink' ? 'Drink order' : 'Supply order'
	const workerName =
		order.checkedBy?.username || options.workerUsername || 'Worker'
	const discrepancyItems = getDiscrepancyItems(order)
	const orderNumber = order.orderNumber || '—'

	const lines = [
		'<b>⚠️ SUPPLY ALERT</b>',
		'',
		`<b>Order:</b> ${escapeHtml(orderNumber)}`,
		`<b>Type:</b> ${orderTypeLabel}`,
		`<b>Branch:</b> ${escapeHtml(order.branch || '—')}`,
		`<b>Requested date:</b> ${formatOrderDate(order.requestedDate)}`,
		`<b>Checked by:</b> ${escapeHtml(workerName)}`,
		`<b>Checked at:</b> ${formatCheckedAt(order.checkedAt)}`,
		'',
		`<b>Missing / short items (${discrepancyItems.length}):</b>`,
	]

	if (discrepancyItems.length === 0) {
		lines.push('No item details available.')
	} else {
		discrepancyItems.forEach((item, index) => {
			lines.push(buildDiscrepancyItemBlock(item, index))
		})
	}

	if (order.receiptNotes?.trim()) {
		lines.push('', `<b>Worker note:</b> ${escapeHtml(order.receiptNotes.trim())}`)
	}

	return lines.join('\n')
}

async function notifyReceiptDiscrepancy(order, options = {}) {
	if (!order?.hasDiscrepancy || !isTelegramConfigured()) {
		return { sent: 0, skipped: true }
	}

	const message = buildReceiptDiscrepancyMessage(order, options)
	return notifyTelegramAdmins(message, { parseMode: 'HTML' })
}

function queueReceiptDiscrepancyNotification(order, options = {}) {
	if (!order?.hasDiscrepancy) {
		return
	}

	if (!isTelegramConfigured()) {
		console.warn(
			'Telegram receipt notification skipped: set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_IDS in backend/.env'
		)
		return
	}

	void notifyReceiptDiscrepancy(order, options)
		.then(result => {
			if (result.sent > 0) {
				console.log(
					`Telegram receipt alert sent for ${order.orderNumber || order._id} (${result.sent} admin(s))`
				)
			}
		})
		.catch(error => {
			console.error('Telegram receipt notification failed:', error.message)
		})
}

module.exports = {
	buildReceiptDiscrepancyMessage,
	notifyReceiptDiscrepancy,
	queueReceiptDiscrepancyNotification,
	getDiscrepancyItems,
}
