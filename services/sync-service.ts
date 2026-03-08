
import React, { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import { CacheService } from './cache-service';
import { OrderService } from './order-service';
import { StockService } from './stock-service';

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

        if (this.isSyncing) return;

        this.isSyncing = true;
        try {
            console.log('[SyncService] 🚀 Iniciando carregamento forçado (Apenas Hoje)...');

            // 1. Limpar cache de hoje para forçar rede
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            // Invalida padrões de cache que podem conter dados de hoje
            await CacheService.invalidatePattern('orders_');
            await CacheService.invalidatePattern('stock_');

            // 2. Fetch Aggressivo (Paralelo) apenas para o dia vigente
            const [ordersRes, stockRes] = await Promise.all([
                OrderService.getAllOrders({
                    page: 1,
                    pageSize: 50,
                    statusFilter: 'all',
                    startDate: today,
                    endDate: today // Somente Hoje conforme solicitado
                }),
                StockService.getMyStock() // Estoque é sempre atual
            ]);

            console.log(`[SyncService] ✅ Carregamento concluído: ${ordersRes.orders.length} OS, ${stockRes.length} itens.`);
            Alert.alert('Sucesso', 'Informações de hoje atualizadas com sucesso!');
        } catch (error) {
            console.error('[SyncService] Sync failed:', error);
            Alert.alert('Erro', 'Falha ao recarregar dados do dia.');
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
