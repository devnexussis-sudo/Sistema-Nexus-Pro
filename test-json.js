const obj = { text: "hello\x00world" };
const str = JSON.stringify(obj);
console.log("Original stringified:", str);
console.log("Regex /\\u0000/g:", str.replace(/\u0000/g, ''));
console.log("Regex /\\\\u0000/g:", str.replace(/\\u0000/g, ''));
