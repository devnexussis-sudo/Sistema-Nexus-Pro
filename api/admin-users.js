
import { createClient } from '@supabase/supabase-js';

// Configuração do Cliente Admin (Backend Seguro)
// A URL pode ser pública, mas a CHAVE DE SERVIÇO deve vir de var de ambiente SEGURA (sem VITE_)
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Chave backend-only

if (!serviceKey) {
    console.error('❌ Falha Crítica: SUPABASE_SERVICE_ROLE_KEY não encontrada no ambiente do servidor.');
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, payload } = req.body;

    try {
        console.log(`🔒 Admin Action: ${action}`);

        if (action === 'create_user') {
            /* Payload: { email, password, email_confirm: true, user_metadata: { ... } } */
            const { data, error } = await supabase.auth.admin.createUser(payload);
            if (error) throw error;
            return res.status(200).json({ data });
        }

        if (action === 'delete_user') {
            /* Payload: { userId: 'uuid' } */
            const { data, error } = await supabase.auth.admin.deleteUser(payload.userId);
            if (error) throw error;
            return res.status(200).json({ data });
        }

        if (action === 'update_user') {
            /* Payload: { userId: 'uuid', updates: { ... } } */
            const { data, error } = await supabase.auth.admin.updateUserById(payload.userId, payload.updates);
            if (error) throw error;
            return res.status(200).json({ data });
        }

        if (action === 'list_users') {
            const { data, error } = await supabase.auth.admin.listUsers();
            if (error) throw error;
            return res.status(200).json({ data });
        }

        return res.status(400).json({ error: 'Invalid action provided' });
    } catch (err) {
        console.error('❌ Admin Action Failed:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}
