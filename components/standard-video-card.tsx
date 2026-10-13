/**
 * StandardVideoCard — Card de Vídeo Padronizado (v3)
 *
 * Padronização visual para exibição de vídeos no formulário dinâmico,
 * anexos extras de evidência e tela de detalhes/histórico da OS.
 *
 * Sincronizado em tamanho e proporção com os cards de fotos (ex: 90x90 ou 100x100),
 * mantendo a capa nativa do vídeo, ícone de play centralizado e botão de remoção.
 */

import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Image,
    ActivityIndicator,
    DimensionValue,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { SecureImage } from '@/components/secure-image';
import { ImageService } from '@/services/image-service';

interface StandardVideoCardProps {
    videoUrl: string;
    thumbUrl?: string | null;
    title?: string;
    subTitle?: string;
    width?: DimensionValue;
    height?: number;
    accentColor?: 'green' | 'blue';
    isProcessing?: boolean;
    processingStatus?: string | null;
    onPress: () => void;
    onDelete?: () => void;
    horizontal?: boolean;
}

export function StandardVideoCard({
    videoUrl,
    thumbUrl: initialThumbUrl,
    title = 'Vídeo',
    subTitle,
    width = 100,
    height = 100,
    accentColor = 'green',
    isProcessing = false,
    processingStatus,
    onPress,
    onDelete,
    horizontal = false,
}: StandardVideoCardProps) {
    const [thumbUri, setThumbUri] = useState<string | null>(initialThumbUrl || null);
    const [isGeneratingThumb, setIsGeneratingThumb] = useState(!initialThumbUrl);

    useEffect(() => {
        let isMounted = true;
        if (initialThumbUrl) {
            setThumbUri(initialThumbUrl);
            setIsGeneratingThumb(false);
            return;
        }

        const loadThumbnail = async () => {
            if (!videoUrl) return;

            try {
                setIsGeneratingThumb(true);

                // Resolve URL remota (Supabase signed URL ou path relativo)
                let resolvedSource = videoUrl;
                if (!videoUrl.startsWith('file://') && !videoUrl.startsWith('http')) {
                    const signed = await ImageService.resolvePhotoUri(videoUrl);
                    if (signed) resolvedSource = signed;
                }

                if (resolvedSource.startsWith('/') && !resolvedSource.startsWith('file://')) {
                    resolvedSource = `file://${resolvedSource}`;
                }

                // Tenta extrair thumbnail da frame do vídeo
                const { uri } = await VideoThumbnails.getThumbnailAsync(resolvedSource, {
                    time: 500,
                    quality: 0.7,
                });

                if (isMounted && uri) {
                    setThumbUri(uri);
                }
            } catch (err) {
                // Fallback silencioso
            } finally {
                if (isMounted) setIsGeneratingThumb(false);
            }
        };

        loadThumbnail();

        return () => { isMounted = false; };
    }, [videoUrl, initialThumbUrl]);

    const playIconColor = accentColor === 'blue' ? '#2563eb' : '#10b981';
    
    // Detecção se o card é compacto (do mesmo tamanho das fotos 90x90 ou 100x100)
    const numericWidth = typeof width === 'number' ? width : 100;
    const isCompact = horizontal || numericWidth <= 130;

    const cardWidth = horizontal ? 140 : width;
    const cardHeight = horizontal ? 100 : height;

    return (
        <View style={[styles.container, { width: cardWidth as DimensionValue, height: cardHeight }]}>
            <Pressable
                style={styles.pressable}
                onPress={onPress}
                activeOpacity={0.88}
                disabled={isProcessing}
            >
                {/* 1. Imagem de Capa/Thumbnail do Vídeo ou Fundo Escuro Estilizado */}
                {thumbUri ? (
                    thumbUri.startsWith('http') ? (
                        <SecureImage uri={thumbUri} style={styles.thumbnail} resizeMode="cover" />
                    ) : (
                        <Image source={{ uri: thumbUri }} style={styles.thumbnail} resizeMode="cover" />
                    )
                ) : (
                    <View style={styles.fallbackBackground}>
                        <Ionicons name="film-outline" size={isCompact ? 28 : 40} color="rgba(255,255,255,0.3)" />
                    </View>
                )}

                {/* Sombra/Gradiente sobre a imagem para destacar o Play */}
                <View style={styles.overlayShade} />

                {/* 2. Botão de Play Centralizado sobre o Card */}
                {isProcessing ? (
                    <View style={styles.centerStatusBox}>
                        <ActivityIndicator size="small" color={playIconColor} />
                        {!isCompact && (
                            <Text style={styles.processingText} numberOfLines={1}>
                                {processingStatus || 'Processando...'}
                            </Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.centerPlayWrapper}>
                        <View style={[styles.playDisk, isCompact && styles.playDiskCompact]}>
                            <Ionicons
                                name="play"
                                size={isCompact ? 16 : 22}
                                color={playIconColor}
                                style={{ marginLeft: isCompact ? 2 : 3 }}
                            />
                        </View>
                    </View>
                )}

                {/* 3. Badge/Rodapé do Vídeo */}
                {!isProcessing && (
                    <View style={[styles.footerBar, isCompact && styles.footerBarCompact]}>
                        <Ionicons name="videocam" size={isCompact ? 10 : 12} color="#ffffff" style={{ marginRight: 3 }} />
                        <Text style={styles.titleText} numberOfLines={1}>
                            {isCompact ? 'VÍDEO' : title}
                        </Text>
                    </View>
                )}
            </Pressable>

            {/* 4. Botão de Exclusão no canto superior direito (mesmo padrão da foto) */}
            {Boolean(onDelete) && !isProcessing && (
                <Pressable
                    style={styles.deleteButton}
                    onPress={onDelete}
                    hitSlop={10}
                >
                    <Ionicons name="close" size={14} color="#ffffff" />
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#0f172a',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    pressable: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    },
    thumbnail: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    fallbackBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayShade: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
    centerPlayWrapper: {
        zIndex: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playDisk: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.95)',
    },
    playDiskCompact: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
    },
    centerStatusBox: {
        zIndex: 5,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    processingText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
        textAlign: 'center',
    },
    footerBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        paddingVertical: 4,
        paddingHorizontal: 6,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 6,
    },
    footerBarCompact: {
        paddingVertical: 2,
        paddingHorizontal: 4,
        justifyContent: 'center',
    },
    titleText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    deleteButton: {
        position: 'absolute',
        top: 3,
        right: 3,
        backgroundColor: 'rgba(239, 68, 68, 0.92)',
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 4,
    },
});
