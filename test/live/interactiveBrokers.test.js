import test from "node:test";
import assert from "node:assert/strict";

import { InteractiveBrokersBroker } from "../../src/live/broker/interactiveBrokers.js";

test("InteractiveBrokersBroker reports optional dependency requirement", async () => {
  const broker = new InteractiveBrokersBroker();
  let connected = false;
  try {
    await broker.connect({ paper: true });
    connected = true;
  } catch (error) {
    assert.match(String(error.message), /@stoqey\/ib/);
  }

  if (connected) {
    assert.equal(broker.isConnected(), true);
  }
  assert.equal(broker.supportsPaperNative(), true);
});
