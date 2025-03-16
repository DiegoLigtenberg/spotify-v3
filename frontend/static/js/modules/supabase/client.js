/**
 * Supabase client module.
 * Initializes and provides access to the Supabase client.
 */

let supabaseClient = null;

/**
 * Initialize the Supabase client
 * @returns {Object} The initialized Supabase client
 */
function initClient() {
    // Check if we already have a client
    if (supabaseClient) return supabaseClient;
    
    // Check for environment variables
    const url = window.ENV?.SUPABASE_URL || '';
    const key = window.ENV?.SUPABASE_KEY || '';
    
    console.log('Supabase config:', { url: url ? 'Set' : 'Not set', key: key ? 'Set' : 'Not set' });
    
    // Get the current origin for redirect
    const currentOrigin = window.location.origin;
    console.log('Current origin for auth redirect:', currentOrigin);
    
    // Ensure the redirect URL includes the proper callback path
    let redirectUrl = currentOrigin;
    
    // Add /auth/callback to the redirect URL if it's not already included
    if (!redirectUrl.endsWith('/auth/callback')) {
        // Check if we're on the production Railway domain
        if (redirectUrl.includes('railway.app')) {
            redirectUrl = 'https://vibify.up.railway.app/auth/callback';
            console.log('Using production redirect URL:', redirectUrl);
        } else {
            // For local development or other environments
            redirectUrl = `${currentOrigin}/auth/callback`;
            console.log('Using generated redirect URL:', redirectUrl);
        }
    }
    
    // Validate URL format
    const isValidUrl = (url) => {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    };
    
    // Use development defaults if needed
    const supabaseUrl = isValidUrl(url) ? url : 'https://knacnvnqdvpsfkkrufmo.supabase.co';
    const supabaseKey = key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuYWNudm5xZHZwc2Zra3J1Zm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE5ODY5NTgsImV4cCI6MjA1NzU2Mjk1OH0.hqh11WwHi4oatFJg75JM-TfK5c1ehNIiR7ucasOpTvg';
    
    if (!isValidUrl(url) || !key) {
        console.warn('Using fallback Supabase configuration for development.');
    }
    
    try {
        // Create the client
        if (typeof supabase === 'undefined') {
            console.error('Supabase JS library not loaded. Make sure to include it in your HTML.');
            return null;
        }
        
        // Define options with the correct redirect URL
        const options = {
            auth: {
                redirectTo: redirectUrl,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        };
        
        console.log('Creating Supabase client with options:', options);
        
        supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, options);
        console.log('Supabase client initialized successfully');
        return supabaseClient;
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
        return null;
    }
}

/**
 * Get the Supabase client instance
 * @returns {Object} The Supabase client
 */
export function getClient() {
    return initClient();
}

// Initialize the client when the module is loaded
initClient(); 