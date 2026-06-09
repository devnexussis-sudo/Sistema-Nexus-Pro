const str = JSON.stringify({ a: '😊', b: '\ud800', c: '\u0000', d: 'test' });
console.log("Original:", str);
console.log("Cleaned:", str.replace(/\\u0000|\\u[dD][0-9a-fA-F]{3}/g, ''));
