var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var calc = require("../src/calculator");

describe("add", function() {
  it("adds positive numbers", function() { assert.strictEqual(calc.add(2, 3), 5); });
  it("adds negative numbers", function() { assert.strictEqual(calc.add(-1, -2), -3); });
});

describe("subtract", function() {
  it("subtracts positive numbers", function() { assert.strictEqual(calc.subtract(5, 3), 2); });
  it("subtracts negative numbers", function() { assert.strictEqual(calc.subtract(-1, -2), 1); });
  it("subtracts to zero", function() { assert.strictEqual(calc.subtract(5, 5), 0); });
});

describe("multiply", function() {
  it("multiplies positive numbers", function() { assert.strictEqual(calc.multiply(3, 4), 12); });
  it("multiplies by zero", function() { assert.strictEqual(calc.multiply(5, 0), 0); });
  it("multiplies negative numbers", function() { assert.strictEqual(calc.multiply(-2, 3), -6); });
});

describe("divide", function() {
  it("divides evenly", function() { assert.strictEqual(calc.divide(10, 2), 5); });
  it("divides with remainder", function() { assert.strictEqual(calc.divide(7, 2), 3.5); });
  it("throws on divide by zero", function() { assert.throws(function() { calc.divide(5, 0); }); });
});

describe("power", function() {
  it("raises to positive exponent", function() { assert.strictEqual(calc.power(2, 3), 8); });
  it("raises to zero exponent", function() { assert.strictEqual(calc.power(5, 0), 1); });
});
