const fs = require('fs');

const file1 = './src/services/paymentService.ts';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace(
  /throw new Error\('❌ Sua conta do Mercado Pago bloqueou a geração direta de Boleto[^;]+;/g,
  "throw new Error(`❌ Bloqueio do Mercado Pago (403 PolicyAgent/Unauthorized). Detalhe da API: ${JSON.stringify(mpData)}`);"
);
fs.writeFileSync(file1, content1);

const file2 = './supabase/functions/mercadopago-create-charge/index.ts';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(
  /throw new Error\("❌ Sua conta do Mercado Pago bloqueou a geração direta de Boleto[^;]+;/g,
  "throw new Error(`❌ Bloqueio do Mercado Pago (403 PolicyAgent). Detalhe da API: ${JSON.stringify(mpData)}`);"
);
fs.writeFileSync(file2, content2);
console.log("Updated error messages to include full API response.");
