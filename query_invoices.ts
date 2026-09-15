import { createClient } from "npm:@supabase/supabase-js";
import { config } from "npm:dotenv";

config({ path: "/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env.local" });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from("invoices").select("id, status, gateway_payment_id, payment_gateway_id").limit(1);
  console.log("Columns:", Object.keys(data?.[0] || {}));
  if (error) console.error("Error:", error);
}
run();
