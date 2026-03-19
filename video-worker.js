// video-worker.js
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// CONFIGURAÇÃO - Pegue no seu Dashboard do Supabase
// PROJECT SETTINGS -> API
const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function processQueue() {
    console.log('🔍 Procurando vídeos pendentes para compressão AV1...');
    
    // 1. Pega o próximo da fila
    const { data: job, error } = await supabase
        .from('video_processing_queue')
        .select('*')
        .eq('status', 'pending')
        .limit(1)
        .single();

    if (error || !job) {
        // console.log('😴 Ninguém na fila...');
        setTimeout(processQueue, 5000); // Tenta de novo em 5 segundos
        return;
    }

    console.log(`🎬 Processando OS: ${job.order_id} | Vídeo: ${job.original_url}`);

    try {
        // Marcando como processando
        await supabase.from('video_processing_queue').update({ status: 'processing' }).eq('id', job.id);

        const inputPath = path.join(__dirname, `temp_input_${job.id}.mp4`);
        const outputPath = path.join(__dirname, `optimized_av1_${job.id}.webm`);

        // 2. Baixar vídeo original
        console.log('📥 Baixando vídeo original...');
        const response = await axios({ url: job.original_url, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 3. COMPRESSÃO AV1 (Mágica aqui)
        console.log('⚖️ Iniciando compressão AV1 (libaom-av1)...');
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .videoCodec('libaom-av1') // Codec AV1
                // CRF 35 para bom balanço entre tamanho e qualidade
                // cpu-used 6-8 para velocidade em CPUs modernas
                .addOptions(['-crf 35', '-cpu-used 6', '-b:v 0']) 
                .on('progress', (progress) => {
                    if (progress.percent) console.log(`⏳ Progresso: ${progress.percent.toFixed(1)}%`);
                })
                .on('end', resolve)
                .on('error', (err) => {
                    console.error('❌ Erro FFmpeg:', err);
                    reject(err);
                })
                .save(outputPath);
        });

        // 4. Upload do vídeo otimizado
        console.log('📤 Subindo vídeo otimizado para o Storage...');
        const fileContent = fs.readFileSync(outputPath);
        const fileName = `orders/${job.order_id}/videos/optimized_av1_${Date.now()}.webm`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('nexus-files')
            .upload(fileName, fileContent, { contentType: 'video/webm', upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl: optimizedUrl } } = supabase.storage.from('nexus-files').getPublicUrl(fileName);

        // 5. Atualizar App e Fila
        const stats = fs.statSync(outputPath);
        const finalSizeMB = (stats.size / 1024 / 1024).toFixed(2);

        console.log(`✨ Atualizando banco de dados com a nova URL: ${optimizedUrl}`);
        
        await supabase.from('orders').update({ 
            video_url: optimizedUrl,
            video_status: 'optimized' 
        }).eq('id', job.order_id);

        await supabase.from('video_processing_queue').update({ 
            status: 'done',
            optimized_url: optimizedUrl,
            optimized_size_mb: finalSizeMB,
            processed_at: new Date().toISOString()
        }).eq('id', job.id);

        console.log(`✅ Sucesso OS ${job.order_id}! Reduzido para ${finalSizeMB} MB`);

        // Limpeza
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    } catch (err) {
        console.error('❌ Erro fatal no processamento:', err);
        await supabase.from('video_processing_queue').update({ 
            status: 'error', 
            error_message: err.message 
        }).eq('id', job.id);
    }

    // Próximo!
    processQueue();
}

console.log('🚀 Worker AV1 iniciado e aguardando vídeos...');
processQueue();
