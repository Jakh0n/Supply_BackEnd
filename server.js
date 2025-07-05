const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv')

// Load environment variables
dotenv.config()

// Import routes
const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const orderRoutes = require('./routes/orders')
const userRoutes = require('./routes/users')
const branchRoutes = require('./routes/branches')

const app = express()

// Middleware

// CORS configuration
app.use(
	cors({
		origin: [
			process.env.FRONTEND_URL,
			'http://localhost:3000',
			'https://depo-backend-vr7u.onrender.com/api',
		],
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		exposedHeaders: ['Content-Range', 'X-Content-Range'],
	})
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Connect to MongoDB
mongoose
	.connect(process.env.MONGODB_URI)
	.then(() => console.log('Connected to MongoDB'))
	.catch(error => console.error('MongoDB connection error:', error))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/users', userRoutes)
app.use('/api/branches', branchRoutes)

// Health check endpoint
app.get('/api/health', (req, res) => {
	res.json({ status: 'OK', message: 'Restaurant Supply API is running' })
})

// Error handling middleware
app.use((error, req, res, next) => {
	console.error(error)
	res.status(500).json({
		message: 'Something went wrong!',
		error:
			process.env.NODE_ENV === 'development'
				? error.message
				: 'Internal server error',
	})
})

// 404 handler
app.use('*', (req, res) => {
	res.status(404).json({ message: 'Route not found' })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
