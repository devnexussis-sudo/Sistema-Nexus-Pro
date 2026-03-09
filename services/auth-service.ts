
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { supabase } from './supabase';

const AUTH_KEY = '@nexus_auth_token';

class AuthService {
    private isAuthenticated: boolean = false;
    private userId: string | null = null;

    async checkAuthStatus(): Promise<boolean> {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                // 🛡️ CONTINUOUS SECURITY CHECK (MIT/Harvard Principle)
                // We must verify that this authenticated user STILL has "App Permission" (exists in technicians and is active)
                const { data: techData, error: techError } = await supabase
                    .from('technicians')
                    .select('id, active')
                    .eq('id', session.user.id)
                    .single();

                if (techError || !techData || techData.active === false) {
                    logger.log(`Session terminalized: User ${session.user.email} lost App Access rights.`, 'warn');
                    await this.logout();
                    return false;
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

    async login(email: string, password: string, keepConnected: boolean = true): Promise<boolean> {
        return this.loginWithPassword(email, password);
    }

    // Overloaded for future use or temporary fix
    async loginWithPassword(email: string, password: string): Promise<boolean> {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.toLowerCase().trim(),
                password,
            });

            if (error) {
                logger.log(`Supabase login error: ${error.message}`, 'error');
                return false;
            }

            if (data.session) {
                // 🛑 ACCESS GATEWAY: Only users in the 'technicians' table with 'active' status can enter the mobile environment.
                const { data: techData, error: techError } = await supabase
                    .from('technicians')
                    .select('id, active')
                    .eq('id', data.user.id)
                    .single();

                if (techError || !techData) {
                    logger.log(`Login denied: E-mail ${data.user.email} not registered in Technicians tab.`, 'warn');
                    await this.logout();
                    return false;
                }

                if (techData.active === false) {
                    logger.log(`Login denied: Technician account is suspended.`, 'warn');
                    await this.logout();
                    return false;
                }

                this.isAuthenticated = true;
                this.userId = data.user.id;
                logger.log('Login successful: Technician Verified & Active', 'info');
                return true;
            }

            return false;
        } catch (error) {
            logger.log(`Login exception: ${error}`, 'error');
            return false;
        }
    }

    async logout(): Promise<void> {
        try {
            await supabase.auth.signOut();
            await AsyncStorage.removeItem(AUTH_KEY); // Clean up any old keys
            this.isAuthenticated = false;
            this.userId = null;
            logger.log('User logged out', 'info');
        } catch (error) {
            logger.log(`Logout failed: ${error}`, 'error');
        }
    }

    async resetPassword(email: string): Promise<boolean> {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
                // O Supabase enviará o e-mail com este link de retorno para o portal web
                // que o usuário já confirmou que está funcionando.
                // Adicionamos ?source=mobile para o painel web saber que deve mostrar instruções de "voltar para o app"
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
}

export const authService = new AuthService();
