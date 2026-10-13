const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Support for older Node.js versions (v18 and below)
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function() {
    return [...this].reverse();
  };
}

const config = getDefaultConfig(__dirname);

module.exports = config;
