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
    const { action, path, bucketType, contentType } = await req.json()
    
    const accountId = Deno.env.get('R2_ACCOUNT_ID')?.trim()
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')?.trim()
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')?.trim()
    
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('As variáveis de ambiente do R2 não estão configuradas na Edge Function.')
    }

    const bucketName = bucketType === 'dropzone' 
        ? Deno.env.get('R2_DROPZONE_BUCKET') || 'nexus-public-dropzone'
        : Deno.env.get('R2_PUBLIC_BUCKET') || 'nexus-files'

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })

    if (action === 'upload') {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: path,
            ContentType: contentType || 'application/octet-stream'
        })
        
        // Gera URL assinada válida por 1 hora
        const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 })

        // URL Pública para acesso depois
        const publicUrl = bucketType === 'dropzone'
            ? `${Deno.env.get('R2_DROPZONE_PUBLIC_URL')?.trim()}/${path}`
            : `${Deno.env.get('R2_PUBLIC_BUCKET_URL')?.trim()}/${path}`

        return new Response(JSON.stringify({ signedUrl, path, bucketName, publicUrl }), {
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
