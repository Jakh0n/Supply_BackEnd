const express = require('express')
const { body, validationResult } = require('express-validator')
const { authenticate, requireAdmin } = require('../middleware/auth')
const User = require('../models/User')
const Order = require('../models/Order')
const Branch = require('../models/Branch')

const router = express.Router()

// Get branch names for workers (authenticated users)
router.get('/names', authenticate, async (req, res) => {
	try {
		// Get all active branches from the Branch collection
		const branches = await Branch.find({ isActive: true })
			.select('name')
			.sort({ name: 1 })

		const branchNames = branches.map(branch => ({
			name: branch.name,
			activeWorkers: 0, // Workers don't need these stats
			totalOrders: 0,
			pendingOrders: 0,
		}))

		res.json({
			branches: branchNames,
		})
	} catch (error) {
		console.error('Get branch names error:', error)
		res.status(500).json({ message: 'Server error fetching branch names' })
	}
})

// Get all branches (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
	try {
		// Get all branches from the Branch collection
		const allBranches = await Branch.find({ isActive: true }).sort({ name: 1 })

		// Get branch statistics
		const branchStats = await Promise.all(
			allBranches.map(async branch => {
				const [activeWorkers, totalOrders, pendingOrders] = await Promise.all([
					User.countDocuments({
						branch: branch.name,
						position: 'worker',
						isActive: true,
					}),
					Order.countDocuments({ branch: branch.name }),
					Order.countDocuments({ branch: branch.name, status: 'pending' }),
				])

				return {
					name: branch.name,
					activeWorkers,
					totalOrders,
					pendingOrders,
				}
			})
		)

		res.json({
			branches: branchStats,
		})
	} catch (error) {
		console.error('Get branches error:', error)
		res.status(500).json({ message: 'Server error fetching branches' })
	}
})

// Create new branch (admin only)
router.post(
	'/',
	authenticate,
	requireAdmin,
	[
		body('name')
			.trim()
			.isLength({ min: 1, max: 100 })
			.withMessage('Branch name must be between 1 and 100 characters')
			.matches(/^[a-zA-Z0-9\s\-_]+$/)
			.withMessage(
				'Branch name can only contain letters, numbers, spaces, hyphens, and underscores'
			),
		body('description')
			.optional()
			.trim()
			.isLength({ max: 500 })
			.withMessage('Description must be less than 500 characters'),
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

			const { name, description } = req.body

			// Check if branch already exists
			const existingBranch = await Branch.findOne({ name })

			if (existingBranch) {
				return res.status(400).json({ message: 'Branch already exists' })
			}

			// Create new branch
			const branch = new Branch({
				name,
				description,
				createdBy: req.user._id,
			})

			await branch.save()

			res.status(201).json({
				message: 'Branch created successfully',
				branch: {
					name: branch.name,
					activeWorkers: 0,
					totalOrders: 0,
					pendingOrders: 0,
				},
			})
		} catch (error) {
			console.error('Create branch error:', error)
			res.status(500).json({ message: 'Server error creating branch' })
		}
	}
)

// Update branch name (admin only)
router.put(
	'/:oldName',
	authenticate,
	requireAdmin,
	[
		body('name')
			.trim()
			.isLength({ min: 1, max: 100 })
			.withMessage('Branch name must be between 1 and 100 characters')
			.matches(/^[a-zA-Z0-9\s\-_]+$/)
			.withMessage(
				'Branch name can only contain letters, numbers, spaces, hyphens, and underscores'
			),
		body('description')
			.optional()
			.trim()
			.isLength({ max: 500 })
			.withMessage('Description must be less than 500 characters'),
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

			const { oldName } = req.params
			const { name, description } = req.body

			// Check if old branch exists
			const existingBranch = await Branch.findOne({ name: oldName })

			if (!existingBranch) {
				return res.status(404).json({ message: 'Branch not found' })
			}

			// Check if new branch name already exists (and is different from old name)
			if (oldName !== name) {
				const duplicateBranch = await Branch.findOne({ name })

				if (duplicateBranch) {
					return res.status(400).json({ message: 'Branch name already exists' })
				}
			}

			// Update branch
			existingBranch.name = name
			if (description !== undefined) {
				existingBranch.description = description
			}
			await existingBranch.save()

			// Update all users with this branch
			await User.updateMany({ branch: oldName }, { branch: name })

			// Update all orders with this branch
			await Order.updateMany({ branch: oldName }, { branch: name })

			res.json({
				message: 'Branch updated successfully',
				branch: { oldName, newName: name },
			})
		} catch (error) {
			console.error('Update branch error:', error)
			res.status(500).json({ message: 'Server error updating branch' })
		}
	}
)

// Delete branch (admin only)
router.delete('/:name', authenticate, requireAdmin, async (req, res) => {
	try {
		const { name } = req.params

		// Check if branch exists
		const existingBranch = await Branch.findOne({ name })

		if (!existingBranch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		// Check if branch has active workers
		const activeWorkers = await User.countDocuments({
			branch: name,
			position: 'worker',
			isActive: true,
		})

		if (activeWorkers > 0) {
			return res.status(400).json({
				message: `Cannot delete branch with ${activeWorkers} active worker(s). Please reassign or deactivate workers first.`,
			})
		}

		// Check if branch has orders
		const ordersCount = await Order.countDocuments({ branch: name })

		if (ordersCount > 0) {
			return res.status(400).json({
				message: `Cannot delete branch with ${ordersCount} order(s). Please reassign orders first.`,
			})
		}

		// Delete the branch
		await Branch.findByIdAndDelete(existingBranch._id)

		res.json({
			message: 'Branch deleted successfully',
			branch: { name },
		})
	} catch (error) {
		console.error('Delete branch error:', error)
		res.status(500).json({ message: 'Server error deleting branch' })
	}
})

// Get branch details (admin only)
router.get('/:name', authenticate, requireAdmin, async (req, res) => {
	try {
		const { name } = req.params

		// Check if branch exists
		const existingBranch = await Branch.findOne({ name })

		if (!existingBranch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		// Get branch statistics and workers
		const [workers, totalOrders, pendingOrders, completedOrders] =
			await Promise.all([
				User.find({
					branch: name,
					position: 'worker',
				}).select('-password'),
				Order.countDocuments({ branch: name }),
				Order.countDocuments({ branch: name, status: 'pending' }),
				Order.countDocuments({ branch: name, status: 'completed' }),
			])

		const activeWorkers = workers.filter(worker => worker.isActive).length

		res.json({
			branch: {
				name,
				description: existingBranch.description,
				activeWorkers,
				totalWorkers: workers.length,
				totalOrders,
				pendingOrders,
				completedOrders,
				workers,
			},
		})
	} catch (error) {
		console.error('Get branch details error:', error)
		res.status(500).json({ message: 'Server error fetching branch details' })
	}
})

module.exports = router
