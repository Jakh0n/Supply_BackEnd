const express = require('express')
const jwt = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const User = require('../models/User')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

// Generate JWT token
const generateToken = userId => {
	return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// Register new user
router.post(
	'/register',
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
			.isIn(['admin', 'worker', 'editor'])
			.withMessage('Position must be admin, worker, or editor'),
		body('branch')
			.optional()
			.isLength({ min: 1 })
			.withMessage('Branch name must not be empty if provided'),
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

			// Create new user
			const userData = { username, password, position }

			// Add branch if provided (optional for workers, not required during registration)
			if (branch) {
				userData.branch = branch
			}

			const user = new User(userData)
			await user.save()

			// Generate token
			const token = generateToken(user._id)

			res.status(201).json({
				message: 'User registered successfully',
				token,
				user: {
					id: user._id,
					username: user.username,
					position: user.position,
					branch: user.branch || null,
				},
			})
		} catch (error) {
			console.error('Registration error:', error)
			res.status(500).json({ message: 'Server error during registration' })
		}
	}
)

// Login user
router.post(
	'/login',
	[
		body('username').notEmpty().withMessage('Username is required'),
		body('password').notEmpty().withMessage('Password is required'),
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

			const { username, password } = req.body

			// Find user
			const user = await User.findOne({ username })
			if (!user || !user.isActive) {
				return res.status(401).json({ message: 'Invalid credentials' })
			}

			// Check password
			const isPasswordValid = await user.comparePassword(password)
			if (!isPasswordValid) {
				return res.status(401).json({ message: 'Invalid credentials' })
			}

			// Generate token
			const token = generateToken(user._id)

			res.json({
				message: 'Login successful',
				token,
				user: {
					id: user._id,
					username: user.username,
					position: user.position,
					branch: user.branch,
				},
			})
		} catch (error) {
			console.error('Login error:', error)
			res.status(500).json({ message: 'Server error during login' })
		}
	}
)

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
	try {
		res.json({
			user: {
				id: req.user._id,
				username: req.user.username,
				position: req.user.position,
				branch: req.user.branch,
				createdAt: req.user.createdAt,
			},
		})
	} catch (error) {
		console.error('Profile error:', error)
		res.status(500).json({ message: 'Server error fetching profile' })
	}
})

// Logout (client-side token removal, but we can add token blacklisting here if needed)
router.post('/logout', authenticate, async (req, res) => {
	try {
		res.json({ message: 'Logout successful' })
	} catch (error) {
		console.error('Logout error:', error)
		res.status(500).json({ message: 'Server error during logout' })
	}
})

module.exports = router
