const { holidayByDate } = require('../data/koreanHolidays')

const DAY_NAMES_KO = [
	'일요일',
	'월요일',
	'화요일',
	'수요일',
	'목요일',
	'금요일',
	'토요일',
]

const DAY_NAMES_EN = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]

function toDateKey(dateInput) {
	const d = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput)
	if (Number.isNaN(d.getTime())) {
		return null
	}
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

function buildTrafficMessages({ isWeekend, isSunday, holiday, trafficHint }) {
	const messages = []

	if (holiday) {
		const name = holiday.nameEn || holiday.nameKo
		messages.push(`Today is ${name}.`)

		if (holiday.trafficHint === 'closed') {
			messages.push(
				'Many branches may be closed for the holiday. Confirm the branch is open before placing a large order.'
			)
		} else if (holiday.trafficHint === 'higher') {
			messages.push(
				'Public holidays and long weekends often bring more customers. Stock a bit more than usual.'
			)
		} else if (holiday.trafficHint === 'lower') {
			messages.push('Orders may be lighter at the start or end of a long break.')
		}
	}

	if (isSunday && !holiday) {
		messages.push('Sunday (regular day off). Check the branch schedule before ordering.')
	}

	if (isWeekend && !holiday && !isSunday) {
		messages.push('Saturday — foot traffic is often higher than on weekdays.')
	}

	if (!isWeekend && !holiday) {
		const hint = trafficHint || 'normal'
		if (hint === 'higher') {
			messages.push('This weekday tends to be busier at the branch.')
		}
	}

	return messages
}

/**
 * Korean calendar context for a given date (KST-neutral, uses local date parts).
 */
function getKoreanDayContext(dateInput = new Date()) {
	const dateKey = toDateKey(dateInput)
	const d = new Date(`${dateKey}T12:00:00`)
	const dayIndex = d.getDay()
	const isWeekend = dayIndex === 0 || dayIndex === 6
	const isSunday = dayIndex === 0
	const holiday = holidayByDate.get(dateKey) || null

	let trafficHint = 'normal'
	if (holiday) {
		trafficHint = holiday.trafficHint
	} else if (isSunday) {
		trafficHint = 'lower'
	} else if (dayIndex === 6) {
		trafficHint = 'higher'
	} else if (dayIndex === 5) {
		trafficHint = 'higher'
	}

	const messages = buildTrafficMessages({
		isWeekend,
		isSunday,
		holiday,
		trafficHint,
	})

	return {
		date: dateKey,
		dayOfWeekKo: DAY_NAMES_KO[dayIndex],
		dayOfWeekEn: DAY_NAMES_EN[dayIndex],
		dayOfWeekIndex: dayIndex,
		isWeekend,
		isSunday,
		isHoliday: Boolean(holiday),
		holidayNameKo: holiday?.nameKo ?? null,
		holidayNameEn: holiday?.nameEn ?? null,
		trafficHint,
		messages,
	}
}

module.exports = {
	getKoreanDayContext,
	toDateKey,
	DAY_NAMES_KO,
	DAY_NAMES_EN,
}
