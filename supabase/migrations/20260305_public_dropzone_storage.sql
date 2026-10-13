-- 🛡️ Nexus Pro - Big Tech Public Dropzone Storage
-- Cria um bucket isolado e seguro de quarentena ("Dropzone") para uploads anônimos
-- (Ex: Assinaturas de orçamentos ou anexos pré-atendimento)

BEGIN;

-- 1. Cria o Bucket Dropzone Público (se não existir)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('nexus-public-dropzone', 'nexus-public-dropzone', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permite APENAS UPLOAD (Insert) para usuários anônimos (Sem listar, sem deletar)
DROP POLICY IF EXISTS "Dropzone Insert Anon" ON storage.objects;
CREATE POLICY "Dropzone Insert Anon" ON storage.objects
FOR INSERT TO anon
WITH CHECK ( bucket_id = 'nexus-public-dropzone' );

-- 3. Permite acesso público de leitura para que as assinaturas carreguem na tela do cliente
DROP POLICY IF EXISTS "Dropzone Select Public" ON storage.objects;
CREATE POLICY "Dropzone Select Public" ON storage.objects
FOR SELECT TO public
USING ( bucket_id = 'nexus-public-dropzone' );

-- 4. Permite manipulação total pelas sessões autenticadas do sistema
DROP POLICY IF EXISTS "Dropzone Manage Auth" ON storage.objects;
CREATE POLICY "Dropzone Manage Auth" ON storage.objects
FOR ALL TO authenticated
USING ( bucket_id = 'nexus-public-dropzone' );

COMMIT;
