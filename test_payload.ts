const payload = {
  "event": "messages.upsert",
  "data": {
    "message": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net" },
      "message": {
        "imageMessage": {
          "url": "https://mmg.whatsapp.net/...",
          "mimetype": "image/jpeg",
          "jpegThumbnail": "/9j/4AAQSkZJRgABAQ..."
        }
      }
    }
  }
};

const msgObj = payload.data?.messages?.[0] || payload.data;
const msgData = msgObj?.message || payload.message || {};
console.log("msgData keys:", Object.keys(msgData)); // will output: ["key", "message"]
console.log("imageMessage:", msgData.imageMessage); // will output: undefined

const realMsgData = payload.data?.messages?.[0]?.message || payload.data?.message?.message || payload.data?.message || payload.message || {};
console.log("realMsgData keys:", Object.keys(realMsgData));
console.log("imageMessage (real):", realMsgData.imageMessage);
