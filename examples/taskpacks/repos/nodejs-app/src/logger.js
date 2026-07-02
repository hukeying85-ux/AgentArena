function createLogger(prefix) {
  return {
    log: function (message) {
      console.log("[" + prefix + "] " + message);
    },
  };
}

module.exports = { createLogger };
