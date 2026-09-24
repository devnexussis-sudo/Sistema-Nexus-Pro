const orders = [
  { status: 'PENDING', createdAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() },
  { status: 'PENDING', createdAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString() },
  { status: 'COMPLETED', createdAt: new Date(Date.now() - 100 * 3600 * 1000).toISOString(), endDate: new Date(Date.now() - 10 * 3600 * 1000).toISOString() }
];

let currentOver24 = 0;
let currentOver48 = 0;
const nowMs = new Date().getTime();

orders.filter(o => !['COMPLETED', 'CANCELED'].includes(o.status)).forEach(o => {
    if (!o.createdAt) return;
    const diffHours = (nowMs - new Date(o.createdAt).getTime()) / (1000 * 60 * 60);
    if (diffHours > 48) {
        currentOver48++;
        currentOver24++;
    } else if (diffHours > 24) {
        currentOver24++;
    }
});

console.log(currentOver24, currentOver48);
