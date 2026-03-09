# 📸 GUIA COMPLETO - CONFIGURAÇÃO DE IMAGENS E ASSINATURAS

## 🎯 OBJETIVO
Configurar o Supabase Storage para armazenar fotos e assinaturas dos formulários preenchidos pelos técnicos.

---

## PASSO 1: Criar o Bucket no Supabase

### 1.1 Acesse o Painel do Supabase
1. Vá para: https://supabase.com/dashboard
2. Selecione seu projeto

### 1.2 Crie o Bucket
1. No menu lateral, clique em **Storage**
2. Clique em **Create a new bucket**
3. Preencha:
   - **Name:** `order-attachments`
   - **Public bucket:** ✅ **MARQUE ESTA OPÇÃO** (para permitir acesso às imagens)
   - **File size limit:** 50 MB (ou conforme necessário)
   - **Allowed MIME types:** `image/jpeg, image/png, image/webp`
4. Clique em **Create bucket**

---

## PASSO 2: Configurar Permissões (Políticas RLS)

### 2.1 Execute o Script SQL
1. Vá em **SQL Editor**
2. Cole o conteúdo do arquivo: `.gemini/configure_storage.sql`
3. Clique em **Run**

### 2.2 Verifique as Políticas
1. Vá em **Storage** → **Policies**
2. Você deve ver 4 políticas criadas:
   - ✅ Permitir upload de anexos
   - ✅ Permitir visualização de anexos
   - ✅ Permitir atualização de anexos
   - ✅ Permitir exclusão de anexos

---

## PASSO 3: Testar o Upload

### 3.1 Teste Manual no Painel
1. Vá em **Storage** → **order-attachments**
2. Clique em **Upload file**
3. Faça upload de uma imagem de teste
4. Verifique se apareceu na lista

### 3.2 Copie a URL Pública
1. Clique na imagem enviada
2. Clique em **Get public URL**
3. Cole a URL no navegador
4. A imagem deve abrir normalmente

---

## PASSO 4: Integrar no Sistema

### 4.1 Já está pronto!
O arquivo `services/storageService.ts` já foi criado com todos os métodos necessários:

```typescript
// Exemplo de uso:

// Upload de foto
const photoFile = await StorageService.uploadPhoto(
  'ord-1001',      // ID da ordem
  'q3',            // ID do campo do formulário
  fileFromInput,   // Arquivo do input
  'tech-1'         // ID do técnico
);

// Upload de assinatura (base64)
const signature = await StorageService.uploadSignature(
  'ord-1001',
  'q4',
  signatureBase64Data,
  'João Silva'     // Nome do assinante
);
```

---

## 📁 ESTRUTURA DE PASTAS

As imagens serão organizadas assim:

```
order-attachments/
└── orders/
    ├── ord-1001/
    │   ├── photos/
    │   │   ├── photo-1706371200000.jpg
    │   │   └── photo-1706371300000.jpg
    │   └── signatures/
    │       ├── signature-1706371400000.png
    │       └── signature-1706371500000.png
    ├── ord-1002/
    │   ├── photos/
    │   └── signatures/
    └── ord-1003/
        ├── photos/
        └── signatures/
```

---

## 💾 ARMAZENAMENTO NO BANCO DE DADOS

### Campo `attachments` na tabela `orders`:

```json
{
  "photos": [
    {
      "id": "photo-1706371200000",
      "url": "https://[project].supabase.co/storage/v1/object/public/order-attachments/orders/ord-1001/photos/photo-1.jpg",
      "fieldId": "q3",
      "uploadedAt": "2024-01-27T15:30:00Z",
      "uploadedBy": "tech-1"
    }
  ],
  "signatures": [
    {
      "id": "signature-1706371400000",
      "url": "https://[project].supabase.co/storage/v1/object/public/order-attachments/orders/ord-1001/signatures/signature-1.png",
      "fieldId": "q4",
      "signerName": "João Silva",
      "uploadedAt": "2024-01-27T15:35:00Z"
    }
  ]
}
```

---

## 🔧 MÉTODOS DISPONÍVEIS

### `StorageService.uploadPhoto()`
Faz upload de uma foto tirada pelo técnico

### `StorageService.uploadSignature()`
Faz upload de uma assinatura digital (base64 ou blob)

### `StorageService.deleteFile()`
Remove um arquivo do storage

### `StorageService.listOrderFiles()`
Lista todos os arquivos de uma ordem específica

### `StorageService.getOrderAttachments()`
Busca os metadados dos anexos salvos no banco

### `StorageService.saveAttachmentsToOrder()`
Salva os metadados dos anexos na ordem

---

## ✅ CHECKLIST DE VERIFICAÇÃO

Após configurar, verifique:

- [ ] Bucket `order-attachments` criado
- [ ] Bucket marcado como **Public**
- [ ] 4 políticas RLS criadas
- [ ] Upload manual funciona
- [ ] URL pública abre a imagem
- [ ] Arquivo `storageService.ts` criado
- [ ] Coluna `attachments` adicionada na tabela `orders`

---

## 🎨 EXEMPLO DE USO NO COMPONENTE

```typescript
import { StorageService } from '../services/storageService';

// Quando o técnico tira uma foto:
const handlePhotoCapture = async (file: File, fieldId: string) => {
  try {
    const uploadedPhoto = await StorageService.uploadPhoto(
      currentOrder.id,
      fieldId,
      file,
      currentUser.id
    );
    
    // Atualizar estado local
    setPhotos([...photos, uploadedPhoto]);
    
    // Salvar no banco
    await StorageService.saveAttachmentsToOrder(
      currentOrder.id,
      [...photos, uploadedPhoto],
      signatures
    );
    
    alert('Foto enviada com sucesso!');
  } catch (error) {
    alert('Erro ao enviar foto');
    console.error(error);
  }
};
```

---

## 🆘 TROUBLESHOOTING

### Erro: "Bucket not found"
→ Crie o bucket `order-attachments` no painel do Supabase

### Erro: "Permission denied"
→ Execute o script SQL de políticas

### Erro: "File too large"
→ Aumente o limite no bucket (Settings → File size limit)

### Imagem não abre
→ Verifique se o bucket está marcado como **Public**

---

## 📊 LIMITES E CUSTOS

**Supabase Free Tier:**
- ✅ 1 GB de storage gratuito
- ✅ 2 GB de transferência/mês
- ✅ Ilimitado de uploads

**Se precisar de mais:**
- Pro Plan: 100 GB por $25/mês
- Storage adicional: $0.021/GB/mês

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Execute o script SQL
2. ✅ Crie o bucket
3. ✅ Teste o upload manual
4. 🔄 Integre no componente de formulário
5. 🔄 Adicione preview de imagens
6. 🔄 Implemente galeria de fotos

---

Pronto! Agora você tem um sistema completo de armazenamento de imagens na nuvem! 📸☁️
