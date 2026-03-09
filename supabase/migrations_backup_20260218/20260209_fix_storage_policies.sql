-- Configuração do Storage para Logotipos e Arquivos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('nexus-files', 'nexus-files', true)
ON CONFLICT (id) DO NOTHING;

-- Habilita acesso público de leitura (para exibir logos no frontend)
DROP POLICY IF EXISTS "Public Select" ON storage.objects;
CREATE POLICY "Public Select" ON storage.objects FOR SELECT 
USING ( bucket_id = 'nexus-files' );

-- Habilita upload parar usuários autenticados
DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
CREATE POLICY "Auth Insert" ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'nexus-files' AND auth.role() = 'authenticated' );

-- Habilita update/delete para usuários autenticados (limpar logos antigas)
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
CREATE POLICY "Auth Update" ON storage.objects FOR UPDATE 
USING ( bucket_id = 'nexus-files' AND auth.role() = 'authenticated' );

DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;
CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE 
USING ( bucket_id = 'nexus-files' AND auth.role() = 'authenticated' );
