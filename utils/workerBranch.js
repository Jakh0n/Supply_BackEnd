/**
 * Branch for worker orders: explicit branch on account, or login username (one account per branch).
 */
function getWorkerBranch(user) {
	if (!user) return null
	const branch = user.branch?.trim()
	if (branch) return branch
	const username = user.username?.trim()
	return username || null
}

module.exports = { getWorkerBranch }
