const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getTelegramConfig,
  isTelegramConfigured,
} = require("../services/telegramService");

test("getTelegramConfig parses admin chat ids", () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatIds = process.env.TELEGRAM_ADMIN_CHAT_IDS;

  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_ADMIN_CHAT_IDS = " 6808924520 , 158467590 ";

  assert.deepEqual(getTelegramConfig(), {
    botToken: "test-token",
    chatIds: ["6808924520", "158467590"],
  });
  assert.equal(isTelegramConfigured(), true);

  process.env.TELEGRAM_BOT_TOKEN = originalToken;
  process.env.TELEGRAM_ADMIN_CHAT_IDS = originalChatIds;
});
