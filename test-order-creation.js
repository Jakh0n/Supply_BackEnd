const axios = require('axios')

// Test order creation with detailed logging
async function testOrderCreation() {
	console.log('🧪 Testing order creation...')

	try {
		// Test data - adjust these values for your system
		const testOrder = {
			branch: 'Test Branch', // Adjust to a real branch name
			requestedDate: new Date().toISOString().split('T')[0], // Today's date
			items: [
				{
					product: '60d21b4667d0d8992e610c85', // Adjust to a real product ID
					quantity: 1,
				},
			],
			notes: 'Test order',
		}

		console.log('📤 Sending order:', JSON.stringify(testOrder, null, 2))

		const response = await axios.post(
			'http://localhost:5000/api/orders',
			testOrder,
			{
				headers: {
					Authorization: 'Bearer YOUR_TOKEN_HERE', // Replace with real token
					'Content-Type': 'application/json',
				},
			}
		)

		console.log('✅ Order created successfully:', response.data)
	} catch (error) {
		console.log('❌ Order creation failed:')
		console.log('Status:', error.response?.status)
		console.log('Error:', error.response?.data)
		console.log('Full error:', error.message)
	}
}

testOrderCreation()
