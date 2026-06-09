const str = JSON.stringify({ a: '\ud800', b: '😂' });
console.log("Stringified:", str);
console.log("Replaced:", str.replace(/\\u[dD][89aAbBcCdDeEfF][0-9a-fA-F]{2}/g, ''));
