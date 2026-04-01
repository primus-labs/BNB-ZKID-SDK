import assert from "node:assert/strict";
import test from "node:test";
import {
  businessParamsToProvingParams,
  cloneGatewayBusinessParamsForRequest
} from "../../src/gateway/business-params.js";

test("cloneGatewayBusinessParamsForRequest preserves arbitrary value shapes", () => {
  assert.deepEqual(cloneGatewayBusinessParamsForRequest({ contribution: ["GitHub", 1] }), {
    contribution: ["GitHub", 1]
  });
});

test("businessParamsToProvingParams maps numeric arrays", () => {
  assert.deepEqual(businessParamsToProvingParams({ contribution: [21, 51] }), {
    contribution: [21, 51]
  });
});

test("businessParamsToProvingParams coerces numeric strings", () => {
  assert.deepEqual(businessParamsToProvingParams({ contribution: ["21", "51"] }), {
    contribution: [21, 51]
  });
});

test("businessParamsToProvingParams strips Brevis-style leading label strings", () => {
  assert.deepEqual(businessParamsToProvingParams({ contribution: ["GitHub", 21, 51] }), {
    contribution: [21, 51]
  });
});

test("businessParamsToProvingParams returns undefined for invalid entries", () => {
  assert.equal(businessParamsToProvingParams({ contribution: [1, "x"] }), undefined);
  assert.equal(businessParamsToProvingParams({ contribution: "nope" }), undefined);
  assert.equal(businessParamsToProvingParams(null), undefined);
  assert.equal(businessParamsToProvingParams({}), undefined);
});
