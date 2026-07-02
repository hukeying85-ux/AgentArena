function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function reverse(str) {
  if (!str) return str;
  return str.split("").reverse().join("");
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + "...";
}

module.exports = { capitalize, reverse, slugify, truncate };
