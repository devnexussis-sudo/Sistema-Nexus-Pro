/**
 * VideoViewerModal — Visualizador de Vídeo Customizado e Universal (v3)
 *
 * Utiliza o WebView nativo com HTML5 Video Player, respeitando as áreas
 * seguras (Safe Area Insets) no iOS (Apple) e Android.
 * Evita sobreposição no cabeçalho (Status Bar / Notch) e na barra de navegação inferior.
 */

import React, { useEffect, useState } from 'react';
import { 
    Modal, 
    View, 
    StyleSheet, 
    Pressable, 
    Text, 
    ActivityIndicator, 
    Platform,
    StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSignedUrl } from '@/components/secure-image';

interface VideoViewerModalProps {
    visible: boolean;
    videoUri?: string | null;
    onClose: () => void;
}

export function VideoViewerModal({ visible, videoUri, onClose }: VideoViewerModalProps) {
    const insets = useSafeAreaInsets();
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

    // Cálculo das margens seguras para Android e Apple (iOS)
    const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 28));
    const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

    const htmlContent = resolvedUri ? `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
            * { box-sizing: border-box; }
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000000; display: flex; justify-content: center; align-items: center; overflow: hidden; }
            video { width: 100%; height: 100%; object-fit: contain; background: #000000; border-radius: 8px; }
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
            <View style={[styles.outerContainer, { paddingTop: topInset, paddingBottom: bottomInset }]}>
                {/* Cabeçalho Seguro (Header Bar) */}
                <View style={styles.headerBar}>
                    <View style={styles.titleWrapper}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="videocam" size={16} color="#10b981" />
                        </View>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            REPRODUTOR DE VÍDEO
                        </Text>
                    </View>

                    <Pressable style={styles.closeButton} onPress={onClose} hitSlop={14}>
                        <View style={styles.closeButtonBg}>
                            <Ionicons name="close" size={22} color="#ffffff" />
                        </View>
                    </Pressable>
                </View>

                {/* Área Interna do Player com Margens de Segurança */}
                <View style={styles.playerContainer}>
                    {isLoading ? (
                        <View style={styles.centerContent}>
                            <ActivityIndicator size="large" color="#10b981" />
                            <Text style={styles.statusText}>Preparando vídeo...</Text>
                        </View>
                    ) : resolvedUri ? (
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
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    outerContainer: {
        flex: 1,
        backgroundColor: '#0a0f1d',
        paddingHorizontal: 12,
    },
    headerBar: {
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 6,
        marginBottom: 8,
    },
    titleWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    closeButton: {
        padding: 4,
    },
    closeButtonBg: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.3)',
    },
    playerContainer: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    statusText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
        marginTop: 6,
    },
    webview: {
        flex: 1,
        backgroundColor: '#000000',
    },
});
