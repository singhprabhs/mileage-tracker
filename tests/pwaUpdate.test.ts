import { describe, expect, it, vi } from "vitest";
import {
  createPwaUpdateController,
  type PwaRegisterOptions,
  type UpdateSWFn,
} from "../src/ui/pwaUpdate";

/** Fake registerSW matching the virtual:pwa-register shape. */
function fakeRegister() {
  let captured: PwaRegisterOptions | undefined;
  const updateSW = vi.fn<UpdateSWFn>(async () => undefined);
  const registerSW = vi.fn((options?: PwaRegisterOptions) => {
    captured = options;
    return updateSW;
  });
  return {
    registerSW,
    updateSW,
    fireNeedRefresh: () => captured?.onNeedRefresh?.(),
    capturedOptions: () => captured,
  };
}

describe("createPwaUpdateController", () => {
  it("registers immediately with an onNeedRefresh callback", () => {
    const fake = fakeRegister();
    createPwaUpdateController(fake.registerSW);
    expect(fake.registerSW).toHaveBeenCalledTimes(1);
    expect(fake.capturedOptions()?.onNeedRefresh).toBeTypeOf("function");
  });

  it("starts with no update, flips once when the worker waits, and notifies subscribers", () => {
    const fake = fakeRegister();
    const controller = createPwaUpdateController(fake.registerSW);
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.getNeedRefresh()).toBe(false);
    fake.fireNeedRefresh();
    expect(controller.getNeedRefresh()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    fake.fireNeedRefresh(); // duplicate signal: no state change
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const fake = fakeRegister();
    const controller = createPwaUpdateController(fake.registerSW);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();
    fake.fireNeedRefresh();
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getNeedRefresh()).toBe(true);
  });

  it("applyUpdate activates the waiting worker with reloadPage: true", async () => {
    const fake = fakeRegister();
    const controller = createPwaUpdateController(fake.registerSW);
    await controller.applyUpdate();
    expect(fake.updateSW).toHaveBeenCalledTimes(1);
    expect(fake.updateSW).toHaveBeenCalledWith(true);
  });

  it("passes registration hooks through untouched", () => {
    const fake = fakeRegister();
    const onRegisteredSW = vi.fn();
    const onRegisterError = vi.fn();
    createPwaUpdateController(fake.registerSW, { onRegisteredSW, onRegisterError });
    expect(fake.capturedOptions()?.onRegisteredSW).toBe(onRegisteredSW);
    expect(fake.capturedOptions()?.onRegisterError).toBe(onRegisterError);
  });
});
