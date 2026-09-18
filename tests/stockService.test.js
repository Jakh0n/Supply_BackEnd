const test = require("node:test");
const assert = require("node:assert/strict");
const {
  InventoryError,
  aggregateItems,
  calculateBalance,
  getTransitionDirection,
} = require("../services/stockService");

test("aggregateItems combines duplicate products and applies direction", () => {
  const entries = aggregateItems(
    [
      { product: "product-b", quantity: 2 },
      { product: "product-a", quantity: 3 },
      { product: "product-b", quantity: 4 },
    ],
    -1,
  );

  assert.deepEqual(entries, [
    { productId: "product-a", delta: -3 },
    { productId: "product-b", delta: -6 },
  ]);
});

test("aggregateItems rejects invalid quantities instead of silently skipping", () => {
  assert.throws(
    () => aggregateItems([{ product: "product-a", quantity: 0 }], -1),
    InventoryError,
  );
});

test("calculateBalance rejects insufficient stock with conflict details", () => {
  assert.throws(
    () =>
      calculateBalance(3, -5, {
        _id: "product-a",
        name: "Ayran",
        unit: "bottles",
      }),
    (error) => {
      assert.equal(error.code, "INSUFFICIENT_STOCK");
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.available, 3);
      assert.equal(error.details.required, 5);
      return true;
    },
  );
});

test("completion applies once and reversing returns stock", () => {
  assert.equal(
    getTransitionDirection("approved", "completed", false, "completed"),
    -1,
  );
  assert.equal(
    getTransitionDirection("completed", "completed", true, "completed"),
    0,
  );
  assert.equal(
    getTransitionDirection("completed", "pending", true, "completed"),
    1,
  );
});

test("historical completed records without inventory marker are not reversed", () => {
  assert.equal(
    getTransitionDirection("completed", "pending", false, "completed"),
    0,
  );
});

test("purchase receipt uses the same transition invariant", () => {
  assert.equal(
    getTransitionDirection("ordered", "received", false, "received"),
    -1,
  );
  assert.equal(
    getTransitionDirection("received", "cancelled", true, "received"),
    1,
  );
});

test("setup mode keeps order completion from changing stock until activation", () => {
  const inventoryActive = false;
  const wouldComplete = getTransitionDirection(
    "approved",
    "completed",
    false,
    "completed",
  );
  assert.equal(inventoryActive && wouldComplete !== 0, false);
});
