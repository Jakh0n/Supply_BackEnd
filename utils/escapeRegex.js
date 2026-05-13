/**
 * Escapes regex metacharacters so user input can be used safely in RegExp or MongoDB $regex.
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = str => {
	if (typeof str !== 'string') {
		return ''
	}
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = { escapeRegex }
