/**
 * VideoViewerModal — Visualizador de Vídeo Customizado e Universal (v3)
 *
 * Enquadramento perfeito com Safe Area Insets (Top Notch & Bottom Navigation Bar).
 * Evita que o player ou os controles fiquem atrás da barra de status, notch
 * ou botões/barra de navegação inferior do Android e iPhone.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSignedUrl } from '@/components/secure-image';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface VideoViewerModalProps {
    visible: boolean;
    videoUri?: string | null;
    onClose: () => void;
}

export function VideoViewerModal({ visible, videoUri, onClose }: VideoViewerModalProps) {
    const insets = useSafeAreaInsets();
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const topInset = Math.max(insets.top, 24);
    const bottomInset = Math.max(insets.bottom, 24);

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
            body, html { 
                margin: 0; 
                padding: 0; 
                width: 100%; 
                height: 100%; 
                background-color: #000000; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                overflow: hidden; 
            }
            video { 
                width: 100vw; 
                height: 100vh; 
                max-height: calc(100vh - ${bottomInset + 20}px);
                object-fit: contain; 
                background: #000000; 
            }
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
            <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
                {/* Header Bar com Botão de Fechar */}
                <View style={[styles.headerBar, { top: topInset + 6 }]}>
                    <Pressable style={styles.closeButton} onPress={onClose} hitSlop={20}>
                        <View style={styles.closeButtonBg}>
                            <Ionicons name="close" size={24} color="#ffffff" />
                        </View>
                    </Pressable>
                </View>

                {/* Carregando URL */}
                {isLoading && (
                    <View style={styles.centerContent}>
                        <ActivityIndicator size="large" color="#10b981" />
                        <Text style={styles.statusText}>Preparando vídeo...</Text>
                    </View>
                )}

                {/* Player Nativo Universal HTML5 via WebView dentro da Área Segura */}
                {!isLoading && resolvedUri && (
                    <View style={[styles.videoWrapper, { marginTop: 50, marginBottom: 10 }]}>
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
    headerBar: {
        position: 'absolute',
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        zIndex: 999,
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
        flex: 1,
        width: SCREEN_W,
        backgroundColor: '#000000',
        overflow: 'hidden',
    },
    webview: {
        flex: 1,
        backgroundColor: '#000000',
    },
    closeButton: {
        padding: 4,
    },
    closeButtonBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.3)',
    },
});
