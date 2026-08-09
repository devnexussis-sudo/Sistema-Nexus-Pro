/**
 * VideoViewerModal — Visualizador de Vídeo Customizado e Universal (v2)
 *
 * Utiliza o WebView nativo com HTML5 Video Player, evitando dependência
 * do módulo descontinuado ExponentAV/expo-av e eliminando crashes nativos.
 * Suporta arquivos locais (file://) e URLs remotas assinadas do Supabase.
 */

import React, { useEffect, useState } from 'react';
import { 
    Modal, 
    View, 
    StyleSheet, 
    Pressable, 
    Text, 
    ActivityIndicator, 
    Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { getSignedUrl } from '@/components/secure-image';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface VideoViewerModalProps {
    visible: boolean;
    videoUri?: string | null;
    onClose: () => void;
}

export function VideoViewerModal({ visible, videoUri, onClose }: VideoViewerModalProps) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let active = true;
        if (!visible || !videoUri) {
            setResolvedUri(null);
            setIsLoading(true);
            return;
        }

        setIsLoading(true);

        let target = videoUri.trim();
        if (target.startsWith('file://') || target.startsWith('data:') || target.startsWith('/')) {
            const finalUri = target.startsWith('/') ? `file://${target}` : target;
            if (active) {
                setResolvedUri(finalUri);
                setIsLoading(false);
            }
        } else {
            getSignedUrl(target)
                .then(signed => {
                    if (active) {
                        setResolvedUri(signed);
                        setIsLoading(false);
                    }
                })
                .catch(() => {
                    if (active) {
                        setResolvedUri(target);
                        setIsLoading(false);
                    }
                });
        }

        return () => { active = false; };
    }, [visible, videoUri]);

    if (!visible || !videoUri) return null;

    const htmlContent = resolvedUri ? `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
            * { box-sizing: border-box; }
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000000; display: flex; justify-content: center; align-items: center; overflow: hidden; }
            video { width: 100vw; height: 100vh; object-fit: contain; background: #000000; }
        </style>
    </head>
    <body>
        <video src="${resolvedUri}" controls autoplay playsinline controlsList="nodownload"></video>
    </body>
    </html>
    ` : '';

    return (
        <Modal 
            visible={visible} 
            transparent={true} 
            onRequestClose={onClose} 
            animationType="fade" 
            statusBarTranslucent
        >
            <View style={styles.container}>
                {/* Botão de Fechar */}
                <Pressable style={styles.closeButton} onPress={onClose} hitSlop={20}>
                    <View style={styles.closeButtonBg}>
                        <Ionicons name="close" size={26} color="#ffffff" />
                    </View>
                </Pressable>

                {/* Carregando URL */}
                {isLoading && (
                    <View style={styles.centerContent}>
                        <ActivityIndicator size="large" color="#10b981" />
                        <Text style={styles.statusText}>Preparando vídeo...</Text>
                    </View>
                )}

                {/* Player Nativo Universal HTML5 via WebView */}
                {!isLoading && resolvedUri && (
                    <View style={styles.videoWrapper}>
                        <WebView
                            source={{ html: htmlContent, baseUrl: '' }}
                            style={styles.webview}
                            allowsFullscreenVideo
                            allowsInlineMediaPlayback
                            mediaPlaybackRequiresUserAction={false}
                            originWhitelist={['*']}
                            allowFileAccess
                            allowFileAccessFromFileURLs
                            allowUniversalAccessFromFileURLs
                        />
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    statusText: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
    },
    videoWrapper: {
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: '#000000',
    },
    webview: {
        flex: 1,
        backgroundColor: '#000000',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 999,
    },
    closeButtonBg: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.3)',
    },
});
