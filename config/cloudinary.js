const cloudinary = require('cloudinary').v2
const multer = require('multer')
const streamifier = require('streamifier')

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Configure multer to use memory storage (stores files in buffer)
const storage = multer.memoryStorage()

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

// Function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
	return new Promise((resolve, reject) => {
		const uploadOptions = {
			folder: 'depo-products',
			allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
			transformation: [
				{ width: 800, height: 600, crop: 'limit' },
				{ quality: 'auto' },
				{ fetch_format: 'auto' },
			],
			...options, // Allow custom options to override defaults
		}

		const uploadStream = cloudinary.uploader.upload_stream(
			uploadOptions,
			(error, result) => {
				if (error) {
					reject(error)
				} else {
					resolve(result)
				}
			}
		)

		streamifier.createReadStream(buffer).pipe(uploadStream)
	})
}

module.exports = { cloudinary, upload, uploadToCloudinary }
