
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
                this.isAuthenticated = true;
                this.userId = session.user.id;
                logger.log(`Auth check successful: ${session.user.email}`, 'info');
                return true;
            }

            // Check if we have a persisted session but it expired or just check local logic
            // Supabase client handles persistence automatically with AsyncStorage if provided
            this.isAuthenticated = false;
            this.userId = null;
            return false;
        } catch (error) {
            logger.log(`Auth check failed: ${error}`, 'error');
            return false;
        }
    }

    async login(email: string, keepConnected: boolean): Promise<boolean> {
        // Since we don't have the password from the UI (it's hardcoded or user inputs), 
        // we assume the UI passes a password.
        // Wait, the UI calls login(email, keepConnected). Where is the password?
        // Ah, the UI component handles password state. We need to update login signature.
        // But for now, let's assume we update the call site too.
        // Or if the password is not passed, we can't login with Supabase.
        // I will update the signature to include password.
        return false;
    }

    // Overloaded for future use or temporary fix
    async loginWithPassword(email: string, password: string): Promise<boolean> {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                logger.log(`Supabase login error: ${error.message}`, 'error');
                return false;
            }

            if (data.session) {
                // 🛑 Security Check: Verify if user is a registered Technician
                const { data: techData, error: techError } = await supabase
                    .from('technicians')
                    .select('id')
                    .eq('id', data.user.id)
                    .single();

                if (techError || !techData) {
                    logger.log(`Login denied: User ${data.user.email} is not a registered technician.`, 'warn');
                    await this.logout(); // Force logout
                    return false;
                }

                this.isAuthenticated = true;
                this.userId = data.user.id;
                logger.log('Login successful via Supabase (Technician Verified)', 'info');
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

    isLoggedIn() {
        return this.isAuthenticated;
    }

    getCurrentUserId() {
        return this.userId;
    }
}

export const authService = new AuthService();
