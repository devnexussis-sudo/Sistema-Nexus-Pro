const url = "https://esrwwaoirlhcptbxtlsu.supabase.co/functions/v1/mercadopago-create-charge";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c";

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key,
    'apikey': key
  },
  body: JSON.stringify({
    action: 'create_boleto_installments',
    itemType: 'INVOICE',
    invoiceId: 'f568d407-e435-43ea-93b5-31627c5db985',
    displayId: '1234',
    amount: 100,
    installments: 4,
    intervalDays: 15,
    firstInstallmentDate: '2026-09-05',
    tenantId: 'cecfe5fd-b14c-4359-a28d-549db815d9e6'
  })
}).then(r => r.json().then(d => ({ status: r.status, data: d })))
  .then(console.log)
  .catch(console.error);
