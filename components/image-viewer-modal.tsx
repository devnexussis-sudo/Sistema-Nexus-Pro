
import React from 'react';
import { StyleSheet, View, Text, Modal, Image, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImageViewerModalProps {
    visible: boolean;
    imageUri: string | null;
    onClose: () => void;
}

export function ImageViewerModal({ visible, imageUri, onClose }: ImageViewerModalProps) {
    if (!imageUri) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <Pressable style={styles.closeButton} onPress={onClose}>
                    <Ionicons name="close-circle" size={40} color="#fff" />
                </Pressable>

                <Image
                    source={{ uri: imageUri }}
                    style={styles.image}
                    resizeMode="contain"
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
    },
    image: {
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
    },
});
