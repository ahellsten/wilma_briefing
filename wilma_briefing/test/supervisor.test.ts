import { describe, expect, it } from "vitest";
import { missingTargetMessage, resolveTarget } from "../src/supervisor.js";

const known = { services: ["mobile_app_my_phone", "persistent_notification"], entities: ["my_watch"] };

describe("notify targets", () => {
  it("tells services from entities", () => {
    expect(resolveTarget("mobile_app_my_phone", known)).toBe("service");
    expect(resolveTarget("my_watch", known)).toBe("entity");
    expect(resolveTarget("other", known)).toBeNull();
  });

  it("explains a missing target and lists what exists", () => {
    expect(missingTargetMessage("my_phone", known)).toBe(
      'notify.my_phone is neither a notify service nor a notify entity. Did you mean "mobile_app_my_phone"? Entities: my_watch. Services: mobile_app_my_phone, persistent_notification'
    );
    expect(missingTargetMessage("x", { services: [], entities: [] })).toBe(
      "notify.x is neither a notify service nor a notify entity. Entities: none. Services: none"
    );
  });
});
