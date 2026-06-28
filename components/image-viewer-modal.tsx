/**
 * ImageViewerModal — Visualizador de Imagem Customizado e Robusto
 *
 * Implementação nativa usando FlatList e ScrollView (zoom no iOS)
 * Garante que não haja travamentos, telas pretas ou loops infinitos.
 * Resolve imagem via SecureImage pipeline (download resiliente).
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
    Modal, 
    View, 
    StyleSheet, 
    Pressable, 
    Text, 
    Image, 
    ActivityIndicator, 
    FlatList, 
    Dimensions,
    ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSignedUrl } from '@/components/secure-image';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ImageViewerModalProps {
    visible: boolean;
    imageUri?: string | null;
    imageUris?: string[];
    initialIndex?: number;
    onClose: () => void;
}

import { ImageZoom } from '@likashefqet/react-native-image-zoom';

const GalleryItem = ({ uri }: { uri: string }) => {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        if (!uri) return;
        
        if (uri.startsWith('file://') || uri.startsWith('data:')) {
            setResolvedUri(uri);
        } else {
            getSignedUrl(uri)
                .then(r => {
                    if (active) setResolvedUri(r);
                })
                .catch(() => {
                    if (active) setResolvedUri(uri);
                });
        }
        return () => { active = false; };
    }, [uri]);

    return (
        <View style={styles.pageContainer}>
            {!resolvedUri ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#ffffff" />
                </View>
            ) : (
                <View style={styles.scrollContainer}>
                    <ImageZoom
                        uri={resolvedUri}
                        style={styles.image}
                        resizeMode="contain"
                    />
                </View>
            )}
        </View>
    );
};

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export function ImageViewerModal({ visible, imageUri, imageUris, initialIndex = 0, onClose }: ImageViewerModalProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const flatListRef = useRef<FlatList>(null);

    const urisToLoad = useMemo(() => {
        if (imageUris && imageUris.length > 0) return imageUris;
        if (imageUri) return [imageUri];
        return [];
    }, [imageUris, imageUri]);

    // Force exact index scroll when modal becomes visible
    useEffect(() => {
        if (visible && urisToLoad.length > 0) {
            setCurrentIndex(initialIndex);
        }
    }, [visible, initialIndex, urisToLoad.length]);

    if (!visible || urisToLoad.length === 0) return null;

    return (
        <Modal visible={visible} transparent={true} onRequestClose={onClose} animationType="fade" statusBarTranslucent>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>
                    <FlatList
                        ref={flatListRef}
                        data={urisToLoad}
                        keyExtractor={(_, index) => `img-${index}`}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        initialScrollIndex={initialIndex}
                        getItemLayout={(_, index) => ({
                            length: SCREEN_W,
                            offset: SCREEN_W * index,
                            index,
                        })}
                        onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
                            if (index !== currentIndex) {
                                setCurrentIndex(index);
                            }
                        }}
                        renderItem={({ item }) => <GalleryItem uri={item} />}
                        windowSize={5}
                        removeClippedSubviews={false}
                    />

                    {/* Header (Close Button) */}
                    <Pressable style={styles.closeButton} onPress={onClose} hitSlop={20}>
                        <View style={styles.closeButtonBg}>
                            <Ionicons name="close" size={24} color="#ffffff" />
                        </View>
                    </Pressable>

                    {/* Footer (Indicator) */}
                    {urisToLoad.length > 1 && (
                        <View style={styles.indicatorContainer}>
                            <View style={styles.indicatorBg}>
                                <Ionicons name="images" size={14} color="#ffffff" />
                                <Text style={styles.indicatorText}>{`${currentIndex + 1} / ${urisToLoad.length}`}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    pageContainer: {
        width: SCREEN_W,
        height: SCREEN_H,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContainer: {
        flex: 1,
        width: SCREEN_W,
    },
    scrollContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: SCREEN_W,
        height: SCREEN_H,
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 100,
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
    indicatorContainer: {
        position: 'absolute',
        bottom: 50,
        alignSelf: 'center',
        zIndex: 100,
    },
    indicatorBg: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.3)',
    },
    indicatorText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
    }
});
