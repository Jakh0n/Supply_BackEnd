/**
 * Products workers can order: purchase-catalog items (with supplier) are excluded.
 */
const WORKER_ORDER_PRODUCT_FILTER = {
	$or: [
		{ supplier: { $exists: false } },
		{ supplier: null },
		{ supplier: '' },
		{ supplier: { $regex: /^\s*$/ } },
	],
}

function isWorkerOrderProduct(product) {
	if (!product?.supplier) return true
	return product.supplier.trim() === ''
}

module.exports = {
	WORKER_ORDER_PRODUCT_FILTER,
	isWorkerOrderProduct,
}
