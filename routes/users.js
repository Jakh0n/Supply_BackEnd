const express = require('express')
const { body, validationResult } = require('express-validator')
const User = require('../models/User')
const { authenticate, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// Get all users (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
	try {
		const { position, active = 'true', search } = req.query
		const filter = {}

		// Filter by position
		if (position && position !== 'all') {
			filter.position = position
		}

		// Filter by active status
		if (active !== 'all') {
			filter.isActive = active === 'true'
		}

		// Search functionality
		if (search) {
			filter.$or = [
				{ username: { $regex: search, $options: 'i' } },
				{ branch: { $regex: search, $options: 'i' } },
			]
		}

		const users = await User.find(filter)
			.select('-password')
			.sort({ createdAt: -1 })

		res.json({
			users,
			total: users.length,
		})
	} catch (error) {
		console.error('Get users error:', error)
		res.status(500).json({ message: 'Server error fetching users' })
	}
})

// Get single user by ID (admin only)
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
	try {
		const user = await User.findById(req.params.id).select('-password')

		if (!user) {
			return res.status(404).json({ message: 'User not found' })
		}

		res.json({ user })
	} catch (error) {
		console.error('Get user error:', error)
		res.status(500).json({ message: 'Server error fetching user' })
	}
})

// Create new user (admin only)
router.post(
	'/',
	authenticate,
	requireAdmin,
	[
		body('username')
			.isLength({ min: 3, max: 30 })
			.withMessage('Username must be between 3 and 30 characters')
			.matches(/^[a-zA-Z0-9_]+$/)
			.withMessage(
				'Username can only contain letters, numbers, and underscores'
			),
		body('password')
			.isLength({ min: 6 })
			.withMessage('Password must be at least 6 characters long'),
		body('position')
			.isIn(['admin', 'worker'])
			.withMessage('Position must be either admin or worker'),
		body('branch')
			.optional()
			.isLength({ min: 1 })
			.withMessage('Branch is required for workers'),
	],
	async (req, res) => {
		try {
			const errors = validationResult(req)
			if (!errors.isEmpty()) {
				return res.status(400).json({
					message: 'Validation failed',
					errors: errors.array(),
				})
			}

			const { username, password, position, branch } = req.body

			// Check if username already exists
			const existingUser = await User.findOne({ username })
			if (existingUser) {
				return res.status(400).json({ message: 'Username already exists' })
			}

			// Validate branch for workers
			if (position === 'worker' && !branch) {
				return res
					.status(400)
					.json({ message: 'Branch is required for workers' })
			}

			// Create new user
			const userData = { username, password, position }
			if (position === 'worker') {
				userData.branch = branch
			}

			const user = new User(userData)
			await user.save()

			res.status(201).json({
				message: 'User created successfully',
				user: {
					id: user._id,
					username: user.username,
					position: user.position,
					branch: user.branch,
					isActive: user.isActive,
					createdAt: user.createdAt,
				},
			})
		} catch (error) {
			console.error('Create user error:', error)
			res.status(500).json({ message: 'Server error creating user' })
		}
	}
)

// Update user (admin only)
router.put(
	'/:id',
	authenticate,
	requireAdmin,
	[
		body('username')
			.optional()
			.isLength({ min: 3, max: 30 })
			.withMessage('Username must be between 3 and 30 characters')
			.matches(/^[a-zA-Z0-9_]+$/)
			.withMessage(
				'Username can only contain letters, numbers, and underscores'
			),
		body('password')
			.optional()
			.isLength({ min: 6 })
			.withMessage('Password must be at least 6 characters long'),
		body('position')
			.optional()
			.isIn(['admin', 'worker'])
			.withMessage('Position must be either admin or worker'),
		body('branch')
			.optional()
			.isLength({ min: 1 })
			.withMessage('Branch cannot be empty'),
	],
	async (req, res) => {
		try {
			const errors = validationResult(req)
			if (!errors.isEmpty()) {
				return res.status(400).json({
					message: 'Validation failed',
					errors: errors.array(),
				})
			}

			const user = await User.findById(req.params.id)
			if (!user) {
				return res.status(404).json({ message: 'User not found' })
			}

			// Prevent admin from updating their own account to avoid lockout
			if (
				req.user._id.toString() === req.params.id &&
				req.body.position === 'worker'
			) {
				return res.status(400).json({
					message: 'Cannot change your own position from admin to worker',
				})
			}

			// Check if new username conflicts with existing user
			if (req.body.username && req.body.username !== user.username) {
				const existingUser = await User.findOne({
					username: req.body.username,
					_id: { $ne: req.params.id },
				})

				if (existingUser) {
					return res.status(400).json({ message: 'Username already exists' })
				}
			}

			// Validate branch for workers
			const newPosition = req.body.position || user.position
			if (newPosition === 'worker' && !req.body.branch && !user.branch) {
				return res
					.status(400)
					.json({ message: 'Branch is required for workers' })
			}

			// Remove branch if changing from worker to admin
			if (newPosition === 'admin' && user.position === 'worker') {
				req.body.branch = undefined
			}

			const updatedUser = await User.findByIdAndUpdate(
				req.params.id,
				req.body,
				{ new: true, runValidators: true }
			).select('-password')

			res.json({
				message: 'User updated successfully',
				user: updatedUser,
			})
		} catch (error) {
			console.error('Update user error:', error)
			res.status(500).json({ message: 'Server error updating user' })
		}
	}
)

// Toggle user active status (admin only)
router.patch(
	'/:id/toggle-status',
	authenticate,
	requireAdmin,
	async (req, res) => {
		try {
			const user = await User.findById(req.params.id)
			if (!user) {
				return res.status(404).json({ message: 'User not found' })
			}

			// Prevent admin from deactivating their own account
			if (req.user._id.toString() === req.params.id) {
				return res.status(400).json({
					message: 'Cannot deactivate your own account',
				})
			}

			user.isActive = !user.isActive
			await user.save()

			res.json({
				message: `User ${
					user.isActive ? 'activated' : 'deactivated'
				} successfully`,
				user: {
					id: user._id,
					username: user.username,
					position: user.position,
					branch: user.branch,
					isActive: user.isActive,
				},
			})
		} catch (error) {
			console.error('Toggle user status error:', error)
			res.status(500).json({ message: 'Server error updating user status' })
		}
	}
)

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
	try {
		const user = await User.findById(req.params.id)
		if (!user) {
			return res.status(404).json({ message: 'User not found' })
		}

		// Prevent admin from deleting their own account
		if (req.user._id.toString() === req.params.id) {
			return res.status(400).json({
				message: 'Cannot delete your own account',
			})
		}

		await User.findByIdAndDelete(req.params.id)

		res.json({ message: 'User deleted successfully' })
	} catch (error) {
		console.error('Delete user error:', error)
		res.status(500).json({ message: 'Server error deleting user' })
	}
})

// Get user statistics (admin only)
router.get('/stats/overview', authenticate, requireAdmin, async (req, res) => {
	try {
		const [totalUsers, activeUsers, adminCount, workerCount, branchStats] =
			await Promise.all([
				User.countDocuments(),
				User.countDocuments({ isActive: true }),
				User.countDocuments({ position: 'admin', isActive: true }),
				User.countDocuments({ position: 'worker', isActive: true }),
				User.aggregate([
					{ $match: { position: 'worker', isActive: true } },
					{
						$group: {
							_id: '$branch',
							count: { $sum: 1 },
						},
					},
					{ $sort: { count: -1 } },
				]),
			])

		res.json({
			totalUsers,
			activeUsers,
			adminCount,
			workerCount,
			branchStats,
		})
	} catch (error) {
		console.error('Get user stats error:', error)
		res.status(500).json({ message: 'Server error fetching user statistics' })
	}
})

// Get all branches (for dropdowns)
router.get('/meta/branches', authenticate, async (req, res) => {
	try {
		const branches = await User.distinct('branch', {
			position: 'worker',
			isActive: true,
			branch: { $exists: true, $ne: null },
		})

		res.json({ branches: branches.sort() })
	} catch (error) {
		console.error('Get branches error:', error)
		res.status(500).json({ message: 'Server error fetching branches' })
	}
})

module.exports = router
