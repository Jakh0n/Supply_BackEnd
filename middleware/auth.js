const jwt = require('jsonwebtoken')
const User = require('../models/User')

// Verify JWT token
const authenticate = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')

		if (!token) {
			return res
				.status(401)
				.json({ message: 'Access denied. No token provided.' })
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)
		const user = await User.findById(decoded.userId).select('-password')

		if (!user || !user.isActive) {
			return res
				.status(401)
				.json({ message: 'Invalid token or user not found.' })
		}

		req.user = user
		next()
	} catch (error) {
		res.status(401).json({ message: 'Invalid token.' })
	}
}

// Check if user is admin
const requireAdmin = (req, res, next) => {
	if (req.user.position !== 'admin') {
		return res
			.status(403)
			.json({ message: 'Access denied. Admin privileges required.' })
	}
	next()
}

// Check if user is worker
const requireWorker = (req, res, next) => {
	if (req.user.position !== 'worker') {
		return res
			.status(403)
			.json({ message: 'Access denied. Worker privileges required.' })
	}
	next()
}

// Check if user is editor
const requireEditor = (req, res, next) => {
	if (req.user.position !== 'editor') {
		return res
			.status(403)
			.json({ message: 'Access denied. Editor privileges required.' })
	}
	next()
}

// Allow both admin and worker
const requireAuth = (req, res, next) => {
	if (!['admin', 'worker', 'editor'].includes(req.user.position)) {
		return res
			.status(403)
			.json({ message: 'Access denied. Invalid user role.' })
	}
	next()
}

// Allow admin or editor (for order viewing)
const requireAdminOrEditor = (req, res, next) => {
	if (!['admin', 'editor'].includes(req.user.position)) {
		return res
			.status(403)
			.json({ message: 'Access denied. Admin or Editor privileges required.' })
	}
	next()
}

module.exports = {
	authenticate,
	requireAdmin,
	requireWorker,
	requireEditor,
	requireAuth,
	requireAdminOrEditor,
}
