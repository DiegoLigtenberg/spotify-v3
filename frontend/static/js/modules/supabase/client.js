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
        
        supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
        console.log('Supabase client initialized successfully');
        return supabaseClient;
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
        return null;
    }
}

/**
 * Create and return a Supabase client instance
 * @returns {SupabaseClient} The Supabase client
 */
export function getClient() {
    // Return existing client if available
    if (supabaseClient) return supabaseClient;
    
    // Get Supabase URL and key from environment variables
    const supabaseUrl = window.ENV.SUPABASE_URL;
    const supabaseKey = window.ENV.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error('Supabase URL or Key not set. Authentication will not work.');
        return null;
    }
    
    try {
        // Get the current origin for proper auth redirects
        const currentOrigin = window.APP_ORIGIN || window.location.origin;
        
        // Create Supabase client
        const client = createClient(supabaseUrl, supabaseKey, {
            auth: {
                // Use the current origin for auth redirects
                redirectTo: `${currentOrigin}/`,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        
        // Store client for future use
        supabaseClient = client;
        
        console.log('Supabase client created with origin:', currentOrigin);
        return client;
    } catch (error) {
        console.error('Error creating Supabase client:', error);
        return null;
    }
}

// Initialize the client when the module is loaded
initClient(); 