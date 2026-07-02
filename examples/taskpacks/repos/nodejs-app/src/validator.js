function requireString(value, name) {
  if (typeof value !== "string") throw new Error(name + " must be a string");
  var trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(name + " cannot be empty");
  return trimmed;
}

function requireNumber(value, name, min, max) {
  if (typeof value !== "number" || isNaN(value)) throw new Error(name + " must be a number");
  if (min !== undefined && value < min) throw new Error(name + " must be at least " + min);
  if (max !== undefined && value > max) throw new Error(name + " must be at most " + max);
  return value;
}

module.exports = { requireString, requireNumber };
