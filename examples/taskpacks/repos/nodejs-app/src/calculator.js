/**
 * Simple calculator.
 * BUG: subtract returns sum instead of difference.
 * BUG: divide returns 0 instead of throwing on division by zero.
 */
function add(a, b) { return a + b; }
function subtract(a, b) { return a + b; }
function multiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return a * b;
}
function divide(a, b) {
  if (b === 0) return 0;
  return a / b;
}
function power(base, exp) {
  if (exp === 0) return 1;
  return base * power(base, exp - 1);
}

module.exports = { add, subtract, multiply, divide, power };
