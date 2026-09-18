const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin, requireAdminOrEditor } = require("../middleware/auth");

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("inventory role middleware allows admin and editor", () => {
  for (const position of ["admin", "editor"]) {
    let called = false;
    requireAdminOrEditor({ user: { position } }, createResponse(), () => {
      called = true;
    });
    assert.equal(called, true);
  }
});

test("inventory role middleware denies workers", () => {
  const response = createResponse();
  let called = false;
  requireAdminOrEditor(
    { user: { position: "worker" } },
    response,
    () => {
      called = true;
    },
  );

  assert.equal(called, false);
  assert.equal(response.statusCode, 403);
});

test("inventory activation middleware allows only admin", () => {
  let called = false;
  requireAdmin({ user: { position: "admin" } }, createResponse(), () => {
    called = true;
  });
  assert.equal(called, true);

  const editorResponse = createResponse();
  let editorCalled = false;
  requireAdmin(
    { user: { position: "editor" } },
    editorResponse,
    () => {
      editorCalled = true;
    },
  );
  assert.equal(editorCalled, false);
  assert.equal(editorResponse.statusCode, 403);
});
