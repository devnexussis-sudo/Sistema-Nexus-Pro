import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';
import { logger } from './logger';
import { supabase } from './supabase';

const AUTH_KEY = '@nexus_auth_token';

class AuthService {
    private isAuthenticated: boolean = false;
    private userId: string | null = null;
    private cachedProfile: any = null;
    private bootCheckCompleted: boolean = false;

    constructor() {
        this.loadCachedProfile();
    }

    private async loadCachedProfile() {
        try {
            const data = await AsyncStorage.getItem('@nexus_user_profile');
            if (data) {
                this.cachedProfile = JSON.parse(data);
            }
        } catch { }
    }

    async checkAuthStatus(): Promise<boolean> {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                if (!this.bootCheckCompleted) {
                    this.bootCheckCompleted = true;
                    const keepConnected = await AsyncStorage.getItem('@nexus_keep_connected');
                    if (keepConnected === 'false') {
                        logger.log(`Session terminalized: keepConnected was false and app rebooted.`, 'info');
                        await this.logout();
                        return false;
                    }
                }

                const { data: techData, error: techError } = await supabase
                    .from('technicians')
                    .select('id, active, name, avatar')
                    .eq('id', session.user.id)
                    .single();

                if (techError || !techData || techData.active === false) {
                    logger.log(`Session terminalized: User ${session.user.email} lost App Access rights.`, 'warn');
                    await this.logout();
                    return false;
                }

                // Cache immediately
                this.cachedProfile = {
                    name: techData.name || session.user.email?.split('@')[0] || 'Técnico',
                    avatar: techData.avatar,
                    email: session.user.email,
                };
                AsyncStorage.setItem('@nexus_user_profile', JSON.stringify(this.cachedProfile)).catch(() => {});

                // Eagerly prefetch the profile image right at session boot to eliminate lazy load delays
                if (techData.avatar) {
                    Image.prefetch(techData.avatar).catch(() => {});
                }

                this.isAuthenticated = true;
                this.userId = session.user.id;
                logger.log(`Auth check successful: ${session.user.email} (Active Technician Verified)`, 'info');
                return true;
            }

            this.isAuthenticated = false;
            this.userId = null;
            return false;
        } catch (error) {
            logger.log(`Auth check failed: ${error}`, 'error');
            return false;
        }
    }

    async login(email: string, password: string, keepConnected: boolean = true): Promise<{success: boolean, errorType?: string}> {
        return this.loginWithPassword(email, password, keepConnected);
    }

    async loginWithPassword(email: string, password: string, keepConnected: boolean = true): Promise<{success: boolean, errorType?: string}> {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.toLowerCase().trim(),
                password,
            });

            if (error) {
                logger.log(`Supabase login error: ${error.message}`, 'error');
                if (error.message.toLowerCase().includes('ban') || error.message.toLowerCase().includes('suspend')) {
                    return { success: false, errorType: 'BLOCKED' };
                }
                return { success: false, errorType: 'INVALID_CREDENTIALS' };
            }

            if (data.session) {
                const { data: techData, error: techError } = await supabase
                    .from('technicians')
                    .select('id, active, name, avatar')
                    .eq('id', data.user.id)
                    .single();

                if (techError || !techData) {
                    logger.log(`Login denied: E-mail ${data.user.email} not registered in Technicians tab.`, 'warn');
                    await this.logout();
                    return { success: false, errorType: 'NOT_FOUND' };
                }

                if (techData.active === false) {
                    logger.log(`Login denied: Technician account is suspended.`, 'warn');
                    await this.logout();
                    return { success: false, errorType: 'BLOCKED' };
                }

                // Cache immediately
                this.cachedProfile = {
                    name: techData.name || data.user.email?.split('@')[0] || 'Técnico',
                    avatar: techData.avatar,
                    email: data.user.email,
                };
                AsyncStorage.setItem('@nexus_user_profile', JSON.stringify(this.cachedProfile)).catch(() => {});
                AsyncStorage.setItem('@nexus_keep_connected', keepConnected ? 'true' : 'false').catch(() => {});

                // Eagerly prefetch the profile image right at login to eliminate lazy load delays
                if (techData.avatar) {
                    Image.prefetch(techData.avatar).catch(() => {});
                }

                this.isAuthenticated = true;
                this.userId = data.user.id;
                logger.log(`Login successful: Technician Verified (Keep connected: ${keepConnected})`, 'info');
                return { success: true };
            }

            return { success: false, errorType: 'INVALID_CREDENTIALS' };
        } catch (error) {
            logger.log(`Login exception: ${error}`, 'error');
            return { success: false, errorType: 'UNKNOWN' };
        }
    }

    async logout(): Promise<void> {
        try {
            await supabase.auth.signOut();
            await AsyncStorage.removeItem(AUTH_KEY);
            await AsyncStorage.removeItem('@nexus_user_profile');
            this.isAuthenticated = false;
            this.userId = null;
            this.cachedProfile = null;
            logger.log('User logged out', 'info');
        } catch (error) {
            logger.log(`Logout failed: ${error}`, 'error');
        }
    }

    async resetPassword(email: string): Promise<boolean> {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
                redirectTo: 'https://app.dunoup.com.br/?source=mobile#/reset-password',
            });

            if (error) {
                logger.log(`Reset password error: ${error.message}`, 'error');
                return false;
            }

            return true;
        } catch (error) {
            logger.log(`Reset password exception: ${error}`, 'error');
            return false;
        }
    }

    isLoggedIn() {
        return this.isAuthenticated;
    }

    getCurrentUserId() {
        return this.userId;
    }

    // Get instantly the cached profile
    getProfileSync() {
        return this.cachedProfile;
    }
}

export const authService = new AuthService();
