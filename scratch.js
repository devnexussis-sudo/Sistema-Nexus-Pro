const url = 'https://dunouptestes.uazapi.com/chat/findMessages/DunoUP';
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'YOUR_TOKEN' // we don't have the real token, but we should get 401 if it exists, not 405!
  },
  body: JSON.stringify({})
}).then(res => {
  console.log(res.status);
  return res.text();
}).then(console.log).catch(console.error);
