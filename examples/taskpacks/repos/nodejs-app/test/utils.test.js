var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var utils = require("../src/utils");

describe("capitalize", function() {
  it("capitalizes first letter of single word", function() { assert.strictEqual(utils.capitalize("hello"), "Hello"); });
  it("capitalizes first letter of every word", function() { assert.strictEqual(utils.capitalize("hello world"), "Hello World"); });
  it("handles empty string", function() { assert.strictEqual(utils.capitalize(""), ""); });
  it("handles single character", function() { assert.strictEqual(utils.capitalize("a"), "A"); });
});

describe("reverse", function() {
  it("reverses a string", function() { assert.strictEqual(utils.reverse("hello"), "olleh"); });
  it("handles empty string", function() { assert.strictEqual(utils.reverse(""), ""); });
});

describe("slugify", function() {
  it("converts to lowercase", function() { assert.strictEqual(utils.slugify("Hello World"), "hello-world"); });
  it("removes special characters", function() { assert.strictEqual(utils.slugify("Hello, World!"), "hello-world"); });
});

describe("truncate", function() {
  it("truncates long strings", function() { assert.strictEqual(utils.truncate("Hello, World!", 5), "Hello..."); });
  it("does not truncate short strings", function() { assert.strictEqual(utils.truncate("Hi", 5), "Hi"); });
});
