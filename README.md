# Restaurant Supply System - Backend API

A comprehensive backend API for managing restaurant supply orders, built with Node.js, Express, and MongoDB.

## Features

- **User Authentication**: JWT-based authentication with role-based access control
- **User Management**: Admin can manage users (workers and admins)
- **Product Management**: Admin can add, edit, and manage supply products
- **Order Management**: Workers can create orders, admins can view and manage all orders
- **PDF Generation**: Generate and download PDF reports of orders
- **Branch Management**: Multi-branch support for restaurant chains

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database with Mongoose ODM
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **Puppeteer** - PDF generation
- **express-validator** - Input validation

## Installation

1. Clone the repository and navigate to the backend directory:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables by creating a `.env` file:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/restaurant-supply
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NODE_ENV=development
```

4. Make sure MongoDB is running on your system

5. Start the development server:

```bash
npm run dev
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/logout` - User logout

### Users (Admin only)

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `PATCH /api/users/:id/toggle-status` - Toggle user active status
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/stats/overview` - Get user statistics
- `GET /api/users/meta/branches` - Get all branches

### Products

- `GET /api/products` - Get all products (with filters)
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create new product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `PATCH /api/products/:id/toggle-status` - Toggle product status (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)
- `GET /api/products/meta/categories` - Get product categories
- `GET /api/products/meta/units` - Get product units

### Orders

- `GET /api/orders` - Get orders (filtered by user role)
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create new order (workers only)
- `PUT /api/orders/:id` - Update order
- `PATCH /api/orders/:id/status` - Update order status (admin only)
- `DELETE /api/orders/:id` - Delete order
- `GET /api/orders/export/pdf` - Get orders data for PDF
- `GET /api/orders/download/pdf` - Download orders as PDF (admin only)
- `GET /api/orders/stats/dashboard` - Get order statistics (admin only)

## User Management

### Promoting Users to Admin

All users register as "worker" by default. To promote a user to admin, you can use MongoDB commands:

#### Using MongoDB Compass or MongoDB Shell:

```javascript
// Find the user by username
db.users.findOne({ username: 'desired_username' })

// Promote user to admin
db.users.updateOne(
	{ username: 'desired_username' },
	{ $set: { position: 'admin' } }
)

// Verify the change
db.users.findOne({ username: 'desired_username' })
```

#### Using MongoDB CLI:

```bash
# Connect to your MongoDB instance
mongosh "your_connection_string"

# Switch to your database
use restaurant_supply

# Promote user to admin
db.users.updateOne(
  { username: "desired_username" },
  { $set: { position: "admin" } }
)
```

#### Using Node.js script (optional):

Create a script `promote-user.js`:

```javascript
const mongoose = require('mongoose')
const User = require('./models/User')

async function promoteUser(username) {
	try {
		await mongoose.connect(process.env.MONGODB_URI)

		const user = await User.findOneAndUpdate(
			{ username: username },
			{ position: 'admin' },
			{ new: true }
		)

		if (user) {
			console.log(`User ${username} promoted to admin successfully`)
		} else {
			console.log(`User ${username} not found`)
		}
	} catch (error) {
		console.error('Error promoting user:', error)
	} finally {
		await mongoose.disconnect()
	}
}

// Usage: node promote-user.js username
const username = process.argv[2]
if (username) {
	promoteUser(username)
} else {
	console.log('Usage: node promote-user.js <username>')
}
```

### User Roles

- **Worker**: Can create and manage their own orders, view products
- **Admin**: Can manage all orders, users, products, and view analytics

## Data Models

### User

```javascript
{
  username: String (unique),
  password: String (hashed),
  position: String (enum: ['admin', 'worker']),
  branch: String (required for workers),
  isActive: Boolean,
  timestamps: true
}
```

### Product

```javascript
{
  name: String,
  category: String (enum),
  unit: String (enum),
  description: String,
  supplier: String,
  isActive: Boolean,
  createdBy: ObjectId (User),
  timestamps: true
}
```

### Order

```javascript
{
  orderNumber: String (auto-generated),
  worker: ObjectId (User),
  branch: String,
  requestedDate: Date,
  items: [{
    product: ObjectId (Product),
    quantity: Number,
    notes: String
  }],
  status: String (enum: ['pending', 'approved', 'rejected', 'completed']),
  notes: String,
  adminNotes: String,
  processedBy: ObjectId (User),
  processedAt: Date,
  timestamps: true
}
```

## Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Error Handling

The API returns consistent error responses:

```javascript
{
  message: "Error description",
  errors: [] // Validation errors (if applicable)
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Development

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

### Database Indexes

The application creates indexes for:

- User username (unique)
- Product name and category
- Order branch, requestedDate, worker, and status

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Input validation and sanitization
- Role-based access control
- Protection against common vulnerabilities

## PDF Generation

The system can generate PDF reports of orders with:

- Professional formatting
- Branch grouping
- Order details and status
- Summary statistics
- Filtering by date and branch
