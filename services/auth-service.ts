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

    private async fetchTechProfile(userId: string, email?: string) {
        try {
            // 1. Check technicians by id
            let { data: techData } = await supabase
                .from('technicians')
                .select('id, active, name, avatar, tenant_id')
                .eq('id', userId)
                .maybeSingle();

            // 2. Check technicians by user_id
            if (!techData) {
                const { data: techByUserId } = await supabase
                    .from('technicians')
                    .select('id, active, name, avatar, tenant_id')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (techByUserId) techData = techByUserId;
            }

            // 3. Check technicians by email
            if (!techData && email) {
                const { data: techByEmail } = await supabase
                    .from('technicians')
                    .select('id, active, name, avatar, tenant_id')
                    .eq('email', email.toLowerCase())
                    .maybeSingle();
                if (techByEmail) techData = techByEmail;
            }

            // 4. Check users table by id
            if (!techData) {
                const { data: userData } = await supabase
                    .from('users')
                    .select('id, name, avatar, avatar_url, role, tenant_id')
                    .eq('id', userId)
                    .maybeSingle();
                if (userData) {
                    techData = {
                        id: userData.id,
                        active: true,
                        name: userData.name,
                        avatar: userData.avatar || userData.avatar_url,
                        tenant_id: userData.tenant_id
                    };
                }
            }
            
            let companyName = null;
            if (techData && techData.tenant_id) {
                const { data: tenant } = await supabase.from('tenants').select('name').eq('id', techData.tenant_id).maybeSingle();
                if (tenant) companyName = tenant.name;
            }

            // 5. Fallback if no record in DB yet (e.g. fresh user metadata)
            if (!techData) {
                return {
                    id: userId,
                    active: true,
                    name: email ? email.split('@')[0] : 'Técnico',
                    avatar: null,
                    companyName: null,
                };
            }

            return { ...techData, companyName };
        } catch (e) {
            return {
                id: userId,
                active: true,
                name: email ? email.split('@')[0] : 'Técnico',
                avatar: null,
                companyName: null,
            };
        }
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

                const techData = await this.fetchTechProfile(session.user.id, session.user.email);

                if (techData.active === false) {
                    logger.log(`Session terminalized: User ${session.user.email} lost App Access rights.`, 'warn');
                    await this.logout();
                    return false;
                }

                // 🛡️ APP_SCOPE GUARD — Bloqueia usuários WEB de acessarem o App Móvel
                try {
                    const { data: userRow } = await supabase
                        .from('users')
                        .select('app_scope')
                        .eq('id', session.user.id)
                        .maybeSingle();
                    if (userRow?.app_scope === 'WEB') {
                        logger.log(`Session terminalized: User ${session.user.email} has WEB-only scope.`, 'warn');
                        await this.logout();
                        return false;
                    }
                } catch (e) { /* Continua se a coluna não existir ainda */ }

                // Cache immediately
                this.cachedProfile = {
                    name: techData.name || session.user.email?.split('@')[0] || 'Técnico',
                    avatar: techData.avatar,
                    email: session.user.email,
                    companyName: techData.companyName,
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
                const techData = await this.fetchTechProfile(data.user.id, data.user.email);

                if (techData.active === false) {
                    logger.log(`Login denied: Technician account is suspended.`, 'warn');
                    await this.logout();
                    return { success: false, errorType: 'BLOCKED' };
                }

                // 🛡️ APP_SCOPE GUARD — Bloqueia usuários WEB de acessarem o App Móvel
                try {
                    const { data: userRow } = await supabase
                        .from('users')
                        .select('app_scope')
                        .eq('id', data.user.id)
                        .maybeSingle();
                    if (userRow?.app_scope === 'WEB') {
                        logger.log(`Login denied: User has WEB-only scope.`, 'warn');
                        await this.logout();
                        return { success: false, errorType: 'SCOPE_BLOCKED' };
                    }
                } catch (e) { /* Continua se a coluna não existir ainda */ }

                // Cache immediately
                this.cachedProfile = {
                    name: techData.name || data.user.email?.split('@')[0] || 'Técnico',
                    avatar: techData.avatar,
                    email: data.user.email,
                    companyName: techData.companyName,
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
            await supabase.auth.signOut().catch(() => {});
            await AsyncStorage.removeItem(AUTH_KEY);
            await AsyncStorage.removeItem('@nexus_user_profile');
            this.isAuthenticated = false;
            this.userId = null;
            this.cachedProfile = null;
            try {
                const { appLifecycle } = require('./app-lifecycle');
                await appLifecycle.destroy();
            } catch {}
            logger.log('User logged out', 'info');
        } catch (error) {
            logger.log(`Logout failed: ${error}`, 'error');
        }
    }

    async resetPassword(email: string): Promise<boolean> {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
                redirectTo: 'https://app.dunoup.com.br/#/reset-password',
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
