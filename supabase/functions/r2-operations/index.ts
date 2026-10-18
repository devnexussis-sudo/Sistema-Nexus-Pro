import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.370.0"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.370.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, path, bucketType, contentType, base64 } = await req.json()

    // Auto-detecta Content-Type pela extensão do arquivo quando não informado
    const detectMime = (filePath: string): string => {
      const ext = filePath.toLowerCase().split('.').pop() || '';
      const mimeMap: Record<string, string> = {
        'mp4': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm',
        '3gp': 'video/3gpp', 'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'pdf': 'application/pdf', 'heic': 'image/heic', 'heif': 'image/heif',
      };
      return mimeMap[ext] || 'application/octet-stream';
    };
    const resolvedContentType = contentType || detectMime(path);

    
    const accountId = Deno.env.get('R2_ACCOUNT_ID')?.trim()
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')?.trim()
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')?.trim()
    
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('As variáveis de ambiente do R2 não estão configuradas na Edge Function.')
    }

    const bucketName = bucketType === 'dropzone' 
        ? 'nexus-public-dropzone'
        : 'nexus-files'

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })

    const FALLBACK_PRIVATE_URL = 'https://pub-e1fad40780de437fbbb01f3b203193e9.r2.dev'
    const FALLBACK_DROPZONE_URL = 'https://pub-4cf13c9b58ea42038881f5e6fef98e17.r2.dev'

    const r2PublicBaseUrl = bucketType === 'dropzone'
        ? FALLBACK_DROPZONE_URL
        : FALLBACK_PRIVATE_URL

    const publicUrl = r2PublicBaseUrl.endsWith('/')
        ? `${r2PublicBaseUrl}${path}`
        : `${r2PublicBaseUrl}/${path}`

    if (action === 'upload') {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: path,
            ContentType: resolvedContentType
        })
        
        // Gera URL assinada válida por 1 hora
        const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 })

        return new Response(JSON.stringify({ signedUrl, path, bucketName, publicUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    if (action === 'direct-upload') {
        if (!base64) {
            throw new Error('Parâmetro base64 ausente para direct-upload')
        }
        const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
        const binary = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: path,
            Body: binary,
            ContentType: resolvedContentType
        })
        await S3.send(command)

        return new Response(JSON.stringify({ success: true, path, bucketName, publicUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
    
    if (action === 'delete') {
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: path,
        })
        await S3.send(command)
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida (use upload ou delete)' }), { 
        status: 400, 
        headers: corsHeaders 
    })
    
  } catch (error: any) {
    console.error("R2 Operation Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
