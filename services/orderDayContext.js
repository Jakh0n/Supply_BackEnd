const { getKoreanDayContext, toDateKey } = require('../utils/koreanCalendar')

function getOrderDayContext(requestedDate) {
	const targetDateKey = toDateKey(requestedDate) || toDateKey(new Date())
	const dayContext = getKoreanDayContext(targetDateKey)

	const summary =
		dayContext.messages.length > 0
			? dayContext.messages.join(' ')
			: `${dayContext.dayOfWeekEn} — plan orders using your usual pattern for this day.`

	return {
		dayContext: {
			...dayContext,
			summary,
		},
	}
}

module.exports = { getOrderDayContext }
