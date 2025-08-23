const express = require('express')
const { body, validationResult } = require('express-validator')
const { authenticate, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// Mock data storage (replace with database models later)
let categories = [
	{
		_id: '1',
		name: 'Frozen Products',
		value: 'frozen-products',
		label: 'Frozen Products',
		description: 'Products that need to be kept frozen',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		_id: '2',
		name: 'Main Products',
		value: 'main-products',
		label: 'Main Products',
		description: 'Primary food products',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		_id: '3',
		name: 'Desserts and Drinks',
		value: 'desserts-drinks',
		label: 'Desserts and Drinks',
		description: 'Sweet treats and beverages',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		_id: '4',
		name: 'Packaging Materials',
		value: 'packaging-materials',
		label: 'Packaging Materials',
		description: 'Materials for packaging products',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		_id: '5',
		name: 'Cleaning Materials',
		value: 'cleaning-materials',
		label: 'Cleaning Materials',
		description: 'Cleaning supplies and materials',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
]

let branches = [
	{
		_id: '1',
		name: 'Main Branch',
		description: 'Primary restaurant location',
		address: '123 Main Street, Seoul',
		phone: '+82-2-1234-5678',
		email: 'main@restaurant.com',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		_id: '2',
		name: 'Downtown Branch',
		description: 'Downtown location',
		address: '456 Downtown Ave, Seoul',
		phone: '+82-2-2345-6789',
		email: 'downtown@restaurant.com',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
]

// ===== CATEGORIES ROUTES =====

// Get all categories
router.get('/categories', authenticate, async (req, res) => {
	try {
		res.json({
			categories: categories.filter(cat => cat.isActive),
			total: categories.filter(cat => cat.isActive).length,
		})
	} catch (error) {
		console.error('Get categories error:', error)
		res.status(500).json({ message: 'Server error fetching categories' })
	}
})

// Get all categories (admin - includes inactive)
router.get('/categories/all', authenticate, requireAdmin, async (req, res) => {
	try {
		res.json({
			categories,
			total: categories.length,
		})
	} catch (error) {
		console.error('Get all categories error:', error)
		res.status(500).json({ message: 'Server error fetching categories' })
	}
})

// Get single category
router.get('/categories/:id', authenticate, async (req, res) => {
	try {
		const category = categories.find(cat => cat._id === req.params.id)
		if (!category) {
			return res.status(404).json({ message: 'Category not found' })
		}
		res.json({ category })
	} catch (error) {
		console.error('Get category error:', error)
		res.status(500).json({ message: 'Server error fetching category' })
	}
})

// Create category (admin only)
router.post(
	'/categories',
	authenticate,
	requireAdmin,
	[
		body('name')
			.notEmpty()
			.withMessage('Category name is required')
			.isLength({ max: 100 })
			.withMessage('Category name cannot exceed 100 characters'),
		body('value')
			.notEmpty()
			.withMessage('Category value is required')
			.matches(/^[a-z0-9-]+$/)
			.withMessage(
				'Category value must contain only lowercase letters, numbers, and hyphens'
			),
		body('description')
			.optional({ checkFalsy: true })
			.isLength({ max: 500 })
			.withMessage('Description cannot exceed 500 characters'),
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

			const { name, value, description } = req.body

			// Check if value already exists
			if (categories.some(cat => cat.value === value)) {
				return res
					.status(400)
					.json({ message: 'Category value already exists' })
			}

			const newCategory = {
				_id: Date.now().toString(),
				name,
				value,
				label: name,
				description: description || undefined,
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}

			categories.push(newCategory)

			res.status(201).json({
				message: 'Category created successfully',
				category: newCategory,
			})
		} catch (error) {
			console.error('Create category error:', error)
			res.status(500).json({ message: 'Server error creating category' })
		}
	}
)

// Update category (admin only)
router.put(
	'/categories/:id',
	authenticate,
	requireAdmin,
	[
		body('name')
			.optional()
			.notEmpty()
			.withMessage('Category name cannot be empty')
			.isLength({ max: 100 })
			.withMessage('Category name cannot exceed 100 characters'),
		body('value')
			.optional()
			.notEmpty()
			.withMessage('Category value cannot be empty')
			.matches(/^[a-z0-9-]+$/)
			.withMessage(
				'Category value must contain only lowercase letters, numbers, and hyphens'
			),
		body('description')
			.optional({ checkFalsy: true })
			.isLength({ max: 500 })
			.withMessage('Description cannot exceed 500 characters'),
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

			const categoryIndex = categories.findIndex(
				cat => cat._id === req.params.id
			)
			if (categoryIndex === -1) {
				return res.status(404).json({ message: 'Category not found' })
			}

			const { name, value, description } = req.body

			// Check if value already exists (excluding current category)
			if (
				value &&
				categories.some(cat => cat.value === value && cat._id !== req.params.id)
			) {
				return res
					.status(400)
					.json({ message: 'Category value already exists' })
			}

			const updatedCategory = {
				...categories[categoryIndex],
				...(name && { name, label: name }),
				...(value && { value }),
				...(description !== undefined && { description }),
				updatedAt: new Date().toISOString(),
			}

			categories[categoryIndex] = updatedCategory

			res.json({
				message: 'Category updated successfully',
				category: updatedCategory,
			})
		} catch (error) {
			console.error('Update category error:', error)
			res.status(500).json({ message: 'Server error updating category' })
		}
	}
)

// Delete category (admin only)
router.delete(
	'/categories/:id',
	authenticate,
	requireAdmin,
	async (req, res) => {
		try {
			const categoryIndex = categories.findIndex(
				cat => cat._id === req.params.id
			)
			if (categoryIndex === -1) {
				return res.status(404).json({ message: 'Category not found' })
			}

			categories.splice(categoryIndex, 1)

			res.json({ message: 'Category deleted successfully' })
		} catch (error) {
			console.error('Delete category error:', error)
			res.status(500).json({ message: 'Server error deleting category' })
		}
	}
)

// Toggle category status (admin only)
router.patch(
	'/categories/:id/toggle-status',
	authenticate,
	requireAdmin,
	async (req, res) => {
		try {
			const categoryIndex = categories.findIndex(
				cat => cat._id === req.params.id
			)
			if (categoryIndex === -1) {
				return res.status(404).json({ message: 'Category not found' })
			}

			categories[categoryIndex].isActive = !categories[categoryIndex].isActive
			categories[categoryIndex].updatedAt = new Date().toISOString()

			res.json({
				message: `Category ${
					categories[categoryIndex].isActive ? 'activated' : 'deactivated'
				} successfully`,
				category: categories[categoryIndex],
			})
		} catch (error) {
			console.error('Toggle category status error:', error)
			res.status(500).json({ message: 'Server error updating category status' })
		}
	}
)

// ===== BRANCHES ROUTES =====

// Get all branches
router.get('/branches', authenticate, async (req, res) => {
	try {
		res.json({
			branches: branches.filter(branch => branch.isActive),
			total: branches.filter(branch => branch.isActive).length,
		})
	} catch (error) {
		console.error('Get branches error:', error)
		res.status(500).json({ message: 'Server error fetching branches' })
	}
})

// Get all branches (admin - includes inactive)
router.get('/branches/all', authenticate, requireAdmin, async (req, res) => {
	try {
		res.json({
			branches,
			total: branches.length,
		})
	} catch (error) {
		console.error('Get all branches error:', error)
		res.status(500).json({ message: 'Server error fetching branches' })
	}
})

// Get single branch
router.get('/branches/:id', authenticate, async (req, res) => {
	try {
		const branch = branches.find(branch => branch._id === req.params.id)
		if (!branch) {
			return res.status(404).json({ message: 'Branch not found' })
		}
		res.json({ branch })
	} catch (error) {
		console.error('Get branch error:', error)
		res.status(500).json({ message: 'Server error fetching branch' })
	}
})

// Create branch (admin only)
router.post(
	'/branches',
	authenticate,
	requireAdmin,
	[
		body('name')
			.notEmpty()
			.withMessage('Branch name is required')
			.isLength({ max: 100 })
			.withMessage('Branch name cannot exceed 100 characters'),
		body('description')
			.optional({ checkFalsy: true })
			.isLength({ max: 500 })
			.withMessage('Description cannot exceed 500 characters'),
		body('address')
			.optional({ checkFalsy: true })
			.isLength({ max: 200 })
			.withMessage('Address cannot exceed 200 characters'),
		body('phone')
			.optional({ checkFalsy: true })
			.isLength({ max: 20 })
			.withMessage('Phone number cannot exceed 20 characters'),
		body('email')
			.optional({ checkFalsy: true })
			.isEmail()
			.withMessage('Invalid email format'),
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

			const { name, description, address, phone, email } = req.body

			// Check if name already exists
			if (
				branches.some(
					branch => branch.name.toLowerCase() === name.toLowerCase()
				)
			) {
				return res.status(400).json({ message: 'Branch name already exists' })
			}

			const newBranch = {
				_id: Date.now().toString(),
				name,
				description: description || undefined,
				address: address || undefined,
				phone: phone || undefined,
				email: email || undefined,
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}

			branches.push(newBranch)

			res.status(201).json({
				message: 'Branch created successfully',
				branch: newBranch,
			})
		} catch (error) {
			console.error('Create branch error:', error)
			res.status(500).json({ message: 'Server error creating branch' })
		}
	}
)

// Update branch (admin only)
router.put(
	'/branches/:id',
	authenticate,
	requireAdmin,
	[
		body('name')
			.optional()
			.notEmpty()
			.withMessage('Branch name cannot be empty')
			.isLength({ max: 100 })
			.withMessage('Branch name cannot exceed 100 characters'),
		body('description')
			.optional({ checkFalsy: true })
			.isLength({ max: 500 })
			.withMessage('Description cannot exceed 500 characters'),
		body('address')
			.optional({ checkFalsy: true })
			.isLength({ max: 200 })
			.withMessage('Address cannot exceed 200 characters'),
		body('phone')
			.optional({ checkFalsy: true })
			.isLength({ max: 20 })
			.withMessage('Phone number cannot exceed 20 characters'),
		body('email')
			.optional({ checkFalsy: true })
			.isEmail()
			.withMessage('Invalid email format'),
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

			const branchIndex = branches.findIndex(
				branch => branch._id === req.params.id
			)
			if (branchIndex === -1) {
				return res.status(404).json({ message: 'Branch not found' })
			}

			const { name, description, address, phone, email } = req.body

			// Check if name already exists (excluding current branch)
			if (
				name &&
				branches.some(
					branch =>
						branch.name.toLowerCase() === name.toLowerCase() &&
						branch._id !== req.params.id
				)
			) {
				return res.status(400).json({ message: 'Branch name already exists' })
			}

			const updatedBranch = {
				...branches[branchIndex],
				...(name && { name }),
				...(description !== undefined && { description }),
				...(address !== undefined && { address }),
				...(phone !== undefined && { phone }),
				...(email !== undefined && { email }),
				updatedAt: new Date().toISOString(),
			}

			branches[branchIndex] = updatedBranch

			res.json({
				message: 'Branch updated successfully',
				branch: updatedBranch,
			})
		} catch (error) {
			console.error('Update branch error:', error)
			res.status(500).json({ message: 'Server error updating branch' })
		}
	}
)

// Delete branch (admin only)
router.delete('/branches/:id', authenticate, requireAdmin, async (req, res) => {
	try {
		const branchIndex = branches.findIndex(
			branch => branch._id === req.params.id
		)
		if (branchIndex === -1) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		branches.splice(branchIndex, 1)

		res.json({ message: 'Branch deleted successfully' })
	} catch (error) {
		console.error('Delete branch error:', error)
		res.status(500).json({ message: 'Server error deleting branch' })
	}
})

// Toggle branch status (admin only)
router.patch(
	'/branches/:id/toggle-status',
	authenticate,
	requireAdmin,
	async (req, res) => {
		try {
			const branchIndex = branches.findIndex(
				branch => branch._id === req.params.id
			)
			if (branchIndex === -1) {
				return res.status(404).json({ message: 'Branch not found' })
			}

			branches[branchIndex].isActive = !branches[branchIndex].isActive
			branches[branchIndex].updatedAt = new Date().toISOString()

			res.json({
				message: `Branch ${
					branches[branchIndex].isActive ? 'activated' : 'deactivated'
				} successfully`,
				branch: branches[branchIndex],
			})
		} catch (error) {
			console.error('Toggle branch status error:', error)
			res.status(500).json({ message: 'Server error updating branch status' })
		}
	}
)

module.exports = router
