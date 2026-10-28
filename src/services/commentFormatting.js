'use strict';
function removeTimestampPrefix(content, timestamp) {
  const text = String(content || '');
  if (!timestamp) return text;
  const prefix = `[${timestamp}]`;
  let result = text.trimStart();
  while (result.startsWith(prefix)) result = result.slice(prefix.length).trimStart();
  return result;
}
module.exports = { removeTimestampPrefix };
