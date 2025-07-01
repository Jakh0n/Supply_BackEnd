const puppeteer = require('puppeteer')

const generateOrdersPDF = async (orders, filters = {}) => {
	try {
		const browser = await puppeteer.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		})

		const page = await browser.newPage()

		// Group orders by branch
		const ordersByBranch = orders.reduce((acc, order) => {
			if (!acc[order.branch]) {
				acc[order.branch] = []
			}
			acc[order.branch].push(order)
			return acc
		}, {})

		// Generate HTML content
		const htmlContent = generateHTML(ordersByBranch, filters)

		await page.setContent(htmlContent, { waitUntil: 'networkidle0' })

		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: {
				top: '20mm',
				right: '15mm',
				bottom: '20mm',
				left: '15mm',
			},
		})

		await browser.close()

		return pdfBuffer
	} catch (error) {
		console.error('PDF generation error:', error)
		throw new Error('Failed to generate PDF')
	}
}

const generateHTML = (ordersByBranch, filters) => {
	const formatDate = date => {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		})
	}

	const generateOrderTable = orders => {
		if (orders.length === 0) {
			return '<p>No orders found for this branch.</p>'
		}

		return `
      <table>
        <thead>
          <tr>
            <th>Order #</th>
            <th>Worker</th>
            <th>Requested Date</th>
            <th>Status</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          ${orders
						.map(
							order => `
            <tr>
              <td>${order.orderNumber}</td>
              <td>${order.worker.username}</td>
              <td>${formatDate(order.requestedDate)}</td>
              <td class="status status-${
								order.status
							}">${order.status.toUpperCase()}</td>
              <td>
                <ul class="items-list">
                  ${order.items
										.map(
											item => `
                    <li>
                      ${item.product.name} - ${item.quantity} ${
												item.product.unit
											}
                      ${
												item.notes
													? `<br><small>Note: ${item.notes}</small>`
													: ''
											}
                    </li>
                  `
										)
										.join('')}
                </ul>
              </td>
            </tr>
          `
						)
						.join('')}
        </tbody>
      </table>
    `
	}

	return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Restaurant Supply Orders Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #333;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
        }
        
        .header h1 {
          margin: 0;
          color: #2563eb;
          font-size: 24px;
        }
        
        .header p {
          margin: 5px 0;
          color: #666;
        }
        
        .branch-section {
          margin-bottom: 40px;
          page-break-inside: avoid;
        }
        
        .branch-title {
          background-color: #f3f4f6;
          padding: 10px 15px;
          border-left: 4px solid #2563eb;
          margin-bottom: 15px;
          font-weight: bold;
          font-size: 18px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
          vertical-align: top;
        }
        
        th {
          background-color: #f8f9fa;
          font-weight: bold;
          color: #374151;
        }
        
        .items-list {
          margin: 0;
          padding-left: 15px;
        }
        
        .items-list li {
          margin-bottom: 5px;
        }
        
        .status {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          text-align: center;
        }
        
        .status-pending {
          background-color: #fef3c7;
          color: #92400e;
        }
        
        .status-approved {
          background-color: #d1fae5;
          color: #065f46;
        }
        
        .status-rejected {
          background-color: #fee2e2;
          color: #991b1b;
        }
        
        .status-completed {
          background-color: #dbeafe;
          color: #1e40af;
        }
        
        .summary {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin-top: 30px;
        }
        
        .summary h3 {
          margin-top: 0;
          color: #374151;
        }
        
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #666;
          border-top: 1px solid #ddd;
          padding-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Restaurant Supply Orders Report</h1>
        <p>Generated on: ${formatDate(new Date())}</p>
        ${filters.date ? `<p>Report Date: ${formatDate(filters.date)}</p>` : ''}
        ${
					filters.branch && filters.branch !== 'all'
						? `<p>Branch: ${filters.branch}</p>`
						: ''
				}
      </div>

      ${Object.entries(ordersByBranch)
				.map(
					([branch, orders]) => `
        <div class="branch-section">
          <div class="branch-title">Branch: ${branch}</div>
          ${generateOrderTable(orders)}
        </div>
      `
				)
				.join('')}

      <div class="summary">
        <h3>Summary</h3>
        <p><strong>Total Branches:</strong> ${
					Object.keys(ordersByBranch).length
				}</p>
        <p><strong>Total Orders:</strong> ${
					Object.values(ordersByBranch).flat().length
				}</p>
        <p><strong>Orders by Status:</strong></p>
        <ul>
          ${['pending', 'approved', 'rejected', 'completed']
						.map(status => {
							const count = Object.values(ordersByBranch)
								.flat()
								.filter(order => order.status === status).length
							return `<li>${status.toUpperCase()}: ${count}</li>`
						})
						.join('')}
        </ul>
      </div>

      <div class="footer">
        <p>Restaurant Supply Management System - Generated automatically</p>
      </div>
    </body>
    </html>
  `
}

module.exports = {
	generateOrdersPDF,
}
