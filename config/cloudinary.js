const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: 'depo-products', // Folder name in your Cloudinary account
		allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
		transformation: [
			{ width: 800, height: 600, crop: 'limit' }, // Optimize images
			{ quality: 'auto' },
			{ fetch_format: 'auto' },
		],
	},
})

// Create multer upload middleware
const upload = multer({
	storage: storage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit
	},
	fileFilter: (req, file, cb) => {
		if (file.mimetype.startsWith('image/')) {
			cb(null, true)
		} else {
			cb(new Error('Only image files are allowed!'), false)
		}
	},
})

module.exports = { cloudinary, upload }
