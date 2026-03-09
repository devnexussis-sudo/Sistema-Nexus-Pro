const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) process.env[k] = envConfig[k];

// Service Key to use raw query? We do not have Service Key here in .env so we cannot execute raw raw via client... Let us do postgres postgrest.

