const TELEGRAM_API_BASE = 'https://api.telegram.org'

function getTelegramConfig() {
	const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
	const chatIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS || '')
		.split(',')
		.map(id => id.trim())
		.filter(Boolean)

	return { botToken, chatIds }
}

function isTelegramConfigured() {
	const { botToken, chatIds } = getTelegramConfig()
	return Boolean(botToken && chatIds.length > 0)
}

async function sendTelegramMessage(chatId, text, options = {}) {
	const { botToken } = getTelegramConfig()
	if (!botToken) {
		throw new Error('Telegram bot token is not configured')
	}

	const body = {
		chat_id: chatId,
		text,
		disable_web_page_preview: true,
	}

	if (options.parseMode) {
		body.parse_mode = options.parseMode
	}

	const response = await fetch(
		`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}
	)

	const payload = await response.json()
	if (!response.ok || !payload.ok) {
		const description = payload.description || 'Telegram API request failed'
		throw new Error(description)
	}

	return payload
}

async function notifyTelegramAdmins(text, options = {}) {
	if (!isTelegramConfigured()) {
		return { sent: 0, skipped: true, failed: [] }
	}

	const { chatIds } = getTelegramConfig()
	const results = await Promise.allSettled(
		chatIds.map(chatId => sendTelegramMessage(chatId, text, options))
	)

	const failed = results
		.map((result, index) => ({ result, chatId: chatIds[index] }))
		.filter(entry => entry.result.status === 'rejected')
		.map(entry => ({
			chatId: entry.chatId,
			reason: entry.result.reason?.message || 'Unknown Telegram error',
		}))

	const sent = chatIds.length - failed.length

	if (sent === 0) {
		throw new Error(
			failed.map(entry => `${entry.chatId}: ${entry.reason}`).join('; ')
		)
	}

	if (failed.length > 0) {
		console.error(
			'Telegram delivery partial failure:',
			failed.map(entry => `${entry.chatId} (${entry.reason})`).join('; ')
		)
	}

	return { sent, skipped: false, failed }
}

module.exports = {
	getTelegramConfig,
	isTelegramConfigured,
	sendTelegramMessage,
	notifyTelegramAdmins,
}
