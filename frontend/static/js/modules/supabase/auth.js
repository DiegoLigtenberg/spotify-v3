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

// Get the Supabase client
const sb = getClient();

// Helper function to get the current session token
export function getAuthToken() {
    const session = sb.auth.session();
    return session ? session.access_token : null;
}

// Helper to add auth headers to fetch requests
export function addAuthHeaders(options = {}) {
    const token = getAuthToken();
    
    if (!token) return options;
    
    // Initialize headers object if it doesn't exist
    if (!options.headers) {
        options.headers = {};
    }
    
    // Add token to headers
    options.headers['Authorization'] = `Bearer ${token}`;
    
    return options;
}

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
        console.log('Attempting to sign in with email/password...');
        const client = getClient();
        
        // Use signInWithPassword for Supabase v2
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            console.error('Supabase auth error:', error.message);
            throw error;
        }
        
        if (!data || !data.session) {
            console.error('No session data returned from signIn');
            throw new Error('Login failed: No session data');
        }
        
        console.log('Sign in successful, saving session');
        
        // Store session in localStorage for persistence
        saveSession(data.session);
        
        // Small delay to ensure state is properly updated before UI changes
        setTimeout(() => {
            // Notify subscribers of auth state change
            authStateChangeEmitter.emit('SIGNED_IN', data);
        }, 100);
        
        return {
            user: data.user,
            error: null
        };
    } catch (error) {
        console.error('Error signing in:', error);
        return {
            user: null,
            error: error || new Error('Login failed')
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
 * @returns {boolean}
 */
export function isAuthenticated() {
    try {
        // First check local session - faster and synchronous
        const token = getAuthToken();
        if (!token) {
            return false;
        }
        
        // Check if we have a cached session in localStorage
        const session = localStorage.getItem('supabase_auth_session');
        if (!session) {
            // Try to check the supabase session directly
            const supabaseSession = localStorage.getItem('sb-session');
            if (!supabaseSession) {
                return false;
            }
        }
        
        // Parse the session and check if it's expired
        try {
            let parsedSession;
            
            // Try to parse our custom session first
            if (session) {
                parsedSession = JSON.parse(session);
            } else {
                // Fall back to parsing the Supabase session
                const supabaseSession = localStorage.getItem('sb-session');
                if (supabaseSession) {
                    parsedSession = JSON.parse(supabaseSession);
                }
            }
            
            if (!parsedSession) {
                return false;
            }
            
            // Check expiration if available
            if (parsedSession.expires_at) {
                const expires = new Date(parsedSession.expires_at);
                if (expires < new Date()) {
                    console.log('Auth session has expired');
                    return false;
                }
            }
            
            return true;
        } catch (e) {
            console.warn('Error parsing auth session:', e);
            return false;
        }
    } catch (error) {
        console.error('Error checking authentication status:', error);
        return false;
    }
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

/**
 * Create a fetch function that automatically adds auth headers
 * for API requests to our backend
 */
export function createAuthFetch() {
    return async (url, options = {}) => {
        const authOptions = addAuthHeaders(options);
        return fetch(url, authOptions);
    };
}

// Create an authenticated fetch function that can be used for API requests
export const authFetch = createAuthFetch(); 