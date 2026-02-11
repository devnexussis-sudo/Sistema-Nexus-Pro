
import React, { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';

class SyncService {
    private isConnected: boolean = true;
    private pendingUploads: any[] = []; // This would usually be persisted in AsyncStorage
    private isSyncing: boolean = false;

    constructor() {
        this.init();
    }

    init() {
        NetInfo.addEventListener(state => {
            console.log('[SyncService] Connection type:', state.type);
            console.log('[SyncService] Is connected?', state.isConnected);
            const wasDisconnected = !this.isConnected;
            this.isConnected = !!state.isConnected;

            if (wasDisconnected && this.isConnected) {
                this.processQueue();
            }
        });
    }

    async forceSync() {
        if (!this.isConnected) {
            Alert.alert('Sem Internet', 'Não é possível sincronizar sem conexão com a internet.');
            return;
        }

        if (this.isSyncing) {
            Alert.alert('Sincronizando', 'Já existe uma sincronização em andamento.');
            return;
        }

        this.isSyncing = true;
        try {
            // Simulate API call delay
            console.log('[SyncService] Starting forced sync...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // In a real app, we would:
            // 1. POST pendingUploads to backend
            // 2. GET new updates from backend

            console.log('[SyncService] Sync completed successfully.');
            Alert.alert('Sucesso', 'Dados sincronizados com sucesso!');
        } catch (error) {
            console.error('[SyncService] Sync failed:', error);
            Alert.alert('Erro', 'Falha ao sincronizar dados.');
        } finally {
            this.isSyncing = false;
        }
    }

    async processQueue() {
        if (this.pendingUploads.length === 0) return;
        console.log('[SyncService] Processing offline queue...');
        await this.forceSync();
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            pendingCount: this.pendingUploads.length
        };
    }
}

export const syncService = new SyncService();
