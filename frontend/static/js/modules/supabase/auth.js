/**
 * Supabase Authentication module.
 * Handles user authentication and session management.
 */

import { getClient } from './client.js';

// Global variable to store current user for faster access
let currentUser = null;

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

/**
 * Get the current authentication token
 * @returns {string|null} The access token or null if not authenticated
 */
export function getAuthToken() {
    // First check localStorage for token
    const token = localStorage.getItem('supabase.auth.token');
    if (token) {
        return token;
    }
    
    // If no token in localStorage, check if we have a session
    try {
        const sessionStr = localStorage.getItem('sb-session');
        if (sessionStr) {
            const session = JSON.parse(sessionStr);
            return session?.access_token || null;
        }
    } catch (e) {
        console.error('Error parsing session:', e);
    }
    
    return null;
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
        
        // Correctly structured Supabase v2 call
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
            throw new Error('Invalid response from authentication service');
        }
        
        console.log('Sign in successful');
        // Emit auth state change event
        authStateChangeEmitter.emit('SIGNED_IN', data);
        
        // Save session
        saveSession(data.session);
        
        // Update current user
        currentUser = data.user;
        
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
 * Sign in with a third-party provider (Google, Facebook, etc.)
 * @param {string} provider - Provider name: 'google', 'facebook', etc.
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function signInWithProvider(provider) {
    try {
        console.log(`Attempting to sign in with ${provider}...`);
        const client = getClient();
        
        // Get the current origin - CRITICAL for mobile devices
        const currentOrigin = window.location.origin;
        console.log('Auth redirect URL basis:', currentOrigin);
        
        // Define the proper redirect URL for each environment
        let redirectUrl = currentOrigin;
        if (currentOrigin.includes('railway.app')) {
            // Use the explicit Railway production URL
            redirectUrl = 'https://vibify.up.railway.app/auth/callback';
            console.log('Using production redirect URL:', redirectUrl);
        } else if (currentOrigin.includes('localhost')) {
            // Use localhost with callback path
            redirectUrl = `${currentOrigin}/auth/callback`;
            console.log('Using local redirect URL:', redirectUrl);
        }
        
        // Ensure options are correctly formatted for Supabase v2
        const { data, error } = await client.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: redirectUrl
            }
        });
        
        if (error) throw error;
        
        // For OAuth we don't get immediate session data
        // It will be handled by onAuthStateChange when the redirect happens
        console.log('OAuth sign-in initiated, browser will redirect');
        
        return {
            user: null,
            error: null,
            provider: provider
        };
    } catch (error) {
        console.error(`Error signing in with ${provider}:`, error);
        return {
            user: null,
            error,
            provider: provider
        };
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
        
        // Clear current user
        currentUser = null;
        
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
        // If we already have the user in memory, return it
        if (currentUser) {
            return currentUser;
        }
        
        // Otherwise check with Supabase
        const client = getClient();
        const { data, error } = await client.auth.getUser();
        
        if (error) throw error;
        
        if (data?.user) {
            // Update session with the latest user data
            const sessionResponse = await client.auth.getSession();
            if (sessionResponse.data?.session) {
                saveSession(sessionResponse.data.session);
                currentUser = data.user;
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
        console.log('Checking authentication status');
        
        // First check if we have the current user in memory
        if (currentUser) {
            return true;
        }
        
        // Check for token
        const token = getAuthToken();
        if (!token) {
            console.log('No auth token found');
            return false;
        }
        
        console.log('Auth token found, user is authenticated');
        return true;
    } catch (error) {
        console.error('Error checking authentication status:', error);
        return false;
    }
}

/**
 * Set up listener for auth state changes
 * @param {Function} callback - Function to call when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
    return authStateChangeEmitter.subscribe(callback);
}

/**
 * Save the session to local storage
 * @param {Object} session - The session object
 */
function saveSession(session) {
    if (!session) return;
    
    localStorage.setItem('supabase.auth.token', session.access_token);
    localStorage.setItem('supabase.auth.refreshToken', session.refresh_token);
    
    // Update current user
    currentUser = session.user;
    
    // Update auth UI
    updateAuthUI();
    
    // Show notification
    showNotification('Successfully logged in!', 'success');
    
    // Important: Refresh liked songs after login
    if (window.musicPlayer && window.musicPlayer.playlistManager) {
        console.log('Refreshing liked songs after login');
        window.musicPlayer.playlistManager.refreshAfterAuthChange();
    } else {
        // Set a flag to refresh when the player is ready
        console.log('Setting refreshLikedSongsOnReady flag for delayed refresh');
        window.refreshLikedSongsOnReady = true;
    }
}

/**
 * Get the session from local storage
 * @returns {Object|null} The session object or null
 */
function getSession() {
    const token = localStorage.getItem('supabase.auth.token');
    const refreshToken = localStorage.getItem('supabase.auth.refreshToken');
    
    if (!token || !refreshToken) return null;
    
    return {
        access_token: token,
        refresh_token: refreshToken,
        user: currentUser
    };
}

/**
 * Clear the session from local storage
 */
function clearSession() {
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('supabase.auth.refreshToken');
    
    // Clear current user
    currentUser = null;
    
    // Update UI
    updateAuthUI();
    
    // Show notification
    showNotification('You have been logged out', 'info');
    
    // Important: Refresh liked songs after logout
    if (window.musicPlayer && window.musicPlayer.playlistManager) {
        console.log('Refreshing liked songs after logout');
        window.musicPlayer.playlistManager.refreshAfterAuthChange();
    }
}

/**
 * Update the auth UI based on authentication state
 */
function updateAuthUI() {
    const isLoggedIn = isAuthenticated();
    console.log('Updating auth UI, logged in:', isLoggedIn);
    
    // Update login/logout buttons
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplay = document.getElementById('user-display');
    
    if (loginBtn) loginBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
    
    // Update user display if available
    if (userDisplay && isLoggedIn && currentUser) {
        userDisplay.textContent = currentUser.email || 'Logged In';
        userDisplay.style.display = 'inline-block';
    } else if (userDisplay) {
        userDisplay.style.display = 'none';
    }
}

/**
 * Show a notification message
 * @param {string} message - The message to show
 * @param {string} type - The notification type (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        console.log(`Notification (${type}): ${message}`);
    }
}

/**
 * Create an authenticated fetch function
 * @returns {Function} A fetch function that automatically adds auth headers
 */
export function createAuthFetch() {
    return async (url, options = {}) => {
        // Add auth headers if available
        const authOptions = addAuthHeaders(options);
        
        // Make the request
        return fetch(url, authOptions);
    };
}

// Initialize the auth system when the module loads
(async function initAuth() {
    try {
        // Try to get the current user
        const user = await getCurrentUser();
        if (user) {
            console.log('User already authenticated:', user.email);
            currentUser = user;
        }
        
        // Set up the auth state listener
        const client = getClient();
        client.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            
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
        
        // Update UI based on initial state
        updateAuthUI();
        
    } catch (error) {
        console.error('Error initializing auth:', error);
    }
})();

// Create an authenticated fetch function that can be used for API requests
export const authFetch = createAuthFetch(); 