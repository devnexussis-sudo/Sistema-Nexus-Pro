import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

import { PaymentService } from './src/services/paymentService';

async function main() {
  console.log("--- Testing checkPaymentStatus via PaymentService ---");
  const result = await PaymentService.checkPaymentStatus({
    itemType: 'QUOTE',
    itemId: 'f1564160-d818-484e-a0e3-2a8192f719dd',
    gatewayPaymentId: '172099672935'
  });

  console.log("Result from PaymentService:", result);
}

main();
