/**
 * Supabase Authentication module.
 * Handles user authentication and session management.
 */

import { getClient } from './client.js';

// Custom event emitter for auth state changes
const authStateChangeEmitter = {
    callbacks: [],
    subscribe(callback) {
        this.callbacks.push(callback);
        return () => {
            this.callbacks = this.callbacks.filter(cb => cb !== callback);
        };
    },
    emit(event, data) {
        this.callbacks.forEach(callback => callback(event, data));
    }
};

/**
 * Sign up a new user with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password 
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function signUp(email, password) {
    try {
        const client = getClient();
        const { data, error } = await client.auth.signUp({
            email,
            password
        });
        
        if (error) throw error;
        
        return {
            user: data.user,
            error: null
        };
    } catch (error) {
        console.error('Error signing up:', error);
        return {
            user: null,
            error
        };
    }
}

/**
 * Sign in a user with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function signIn(email, password) {
    try {
        const client = getClient();
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Store session
        saveSession(data.session);
        
        // Notify subscribers
        authStateChangeEmitter.emit('SIGNED_IN', data);
        
        return {
            user: data.user,
            error: null
        };
    } catch (error) {
        console.error('Error signing in:', error);
        return {
            user: null,
            error
        };
    }
}

/**
 * Sign in with a third-party provider
 * @param {string} provider - Provider name (google, github, etc)
 * @returns {Promise<void>}
 */
export async function signInWithProvider(provider) {
    try {
        const client = getClient();
        
        // Use the correct redirect URL that matches what's in Google Console
        // Do not specify redirectTo - let Supabase use its default callback
        const { data, error } = await client.auth.signInWithOAuth({
            provider: provider.toLowerCase()
            // Remove the options to let Supabase handle the correct redirect
        });
        
        if (error) {
            // Extract useful information from Supabase error
            console.error(`Provider auth error:`, error);
            
            if (error.message && error.message.includes('validation failed') && 
                error.message.includes('not enabled')) {
                throw new Error(`${provider} login is not enabled for this application`);
            }
            
            throw error;
        }
        
        // The browser will be redirected to the provider's site
        return data;
    } catch (error) {
        console.error(`Error signing in with ${provider}:`, error);
        throw error;
    }
}

/**
 * Sign out the current user
 * @returns {Promise<{error: Error|null}>}
 */
export async function signOut() {
    try {
        const client = getClient();
        const { error } = await client.auth.signOut();
        
        if (error) throw error;
        
        // Clear session
        clearSession();
        
        // Notify subscribers
        authStateChangeEmitter.emit('SIGNED_OUT');
        
        return { error: null };
    } catch (error) {
        console.error('Error signing out:', error);
        return { error };
    }
}

/**
 * Get the current authenticated user
 * @returns {Promise<Object|null>} The user object or null if not authenticated
 */
export async function getCurrentUser() {
    try {
        // First try to get from session storage
        const session = getSession();
        if (session?.user) {
            return session.user;
        }
        
        // Otherwise check with Supabase
        const client = getClient();
        const { data, error } = await client.auth.getUser();
        
        if (error) throw error;
        
        if (data?.user) {
            // Update session with the latest user data
            const sessionResponse = await client.auth.getSession();
            if (sessionResponse.data.session) {
                saveSession(sessionResponse.data.session);
            }
            return data.user;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Check if a user is currently authenticated
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
    const user = await getCurrentUser();
    return user !== null;
}

/**
 * Subscribe to authentication state changes
 * @param {Function} callback - Function to call when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
    return authStateChangeEmitter.subscribe(callback);
}

/**
 * Save session to localStorage
 * @param {Object} session - Session object from Supabase
 */
function saveSession(session) {
    if (session) {
        localStorage.setItem('supabase_session', JSON.stringify(session));
    }
}

/**
 * Get session from localStorage
 * @returns {Object|null} Session object or null
 */
function getSession() {
    try {
        const session = localStorage.getItem('supabase_session');
        return session ? JSON.parse(session) : null;
    } catch (error) {
        console.error('Error parsing session from storage:', error);
        return null;
    }
}

/**
 * Clear session from localStorage
 */
function clearSession() {
    localStorage.removeItem('supabase_session');
}

// Set up auth state change listener
const client = getClient();
if (client) {
    client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            saveSession(session);
            authStateChangeEmitter.emit('SIGNED_IN', { session, user: session.user });
        } else if (event === 'SIGNED_OUT') {
            clearSession();
            authStateChangeEmitter.emit('SIGNED_OUT');
        } else if (event === 'USER_UPDATED') {
            saveSession(session);
            authStateChangeEmitter.emit('USER_UPDATED', { session, user: session.user });
        }
    });
} 