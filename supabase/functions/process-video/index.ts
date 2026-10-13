import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge Function: process-video
 *
 * Recebe a URL de um vídeo cru (MP4) do Supabase Storage,
 * registra a intenção de compressão, e retorna imediatamente.
 *
 * A compressão AV1 real será feita por um worker externo
 * (ex: CloudFlare Worker, servidor FFmpeg, ou serviço de transcoding)
 * que consulta a fila `video_processing_queue` e processa.
 *
 * Esta function:
 * 1. Recebe { videoUrl, orderId, tenantId, originalSizeMB }
 * 2. Insere na tabela `video_processing_queue` com status 'pending'
 * 3. Retorna imediatamente para não bloquear o app
 *
 * Para projetos com volume de vídeo, integrar com:
 * - Cloudflare Stream (AV1 automático + CDN)
 * - Mux
 * - FFmpeg rodando em Cloud Run / Railway / Fly.io
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { videoUrl, orderId, tenantId, originalSizeMB } = await req.json();

    if (!videoUrl || !orderId) {
      return new Response(
        JSON.stringify({ error: "videoUrl and orderId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Criar cliente Supabase com service role (acesso admin)
    const supabaseUrl = Deno.env.get("PROJECT_URL")!;
    const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Registrar na fila de processamento
    const { error: queueError } = await supabase
      .from("video_processing_queue")
      .upsert(
        {
          order_id: orderId,
          tenant_id: tenantId,
          original_url: videoUrl,
          original_size_mb: originalSizeMB,
          status: "pending",
          codec_target: "av1",
          created_at: new Date().toISOString(),
        },
        { onConflict: "order_id" }
      );

    if (queueError) {
      console.error("[process-video] Queue insert error:", queueError);
      // Não falha — o vídeo original já está salvo
    }

    // Atualizar a OS com o link do vídeo original (garantia)
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        video_url: videoUrl,
        video_size_mb: originalSizeMB,
        video_status: "uploaded", // uploaded → processing → optimized
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("[process-video] Order update error:", updateError);
    }

    console.log(
      `[process-video] ✅ Vídeo registrado para compressão AV1: ${orderId} (${originalSizeMB} MB)`
    );

    // Retorna sucesso imediato — a compressão AV1 acontecerá em background
    // Quando um worker processar, ele atualizará video_url com a versão otimizada
    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Vídeo registrado. Compressão AV1 será processada em background.",
        originalUrl: videoUrl,
        status: "pending",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[process-video] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
