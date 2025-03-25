/**
 * Application initialization script.
 * Loads all required modules and initializes the application.
 */

// Import Supabase auth module
import AuthUI from './modules/supabase/authUI.js';
import { getClient } from './modules/supabase/client.js';
import AudioPlayer from './modules/AudioPlayer.js';

// Detect environment for loading environment variables
function loadEnvironmentVariables() {
    // Create a global ENV object
    window.ENV = window.ENV || {};
    
    // Detect if we're in production based on hostname
    // This will be replaced with actual environment variables in production
    const isProduction = window.location.hostname.includes('railway.app') || 
                         !window.location.hostname.includes('localhost');
    
    // Set environment variables
    window.ENV.IS_PRODUCTION = isProduction;
    
    // In production, these would be injected by the backend or deployment platform
    if (isProduction) {
        // These are placeholders that should be replaced during deployment
        window.ENV.SUPABASE_URL = '__SUPABASE_URL__';
        window.ENV.SUPABASE_KEY = '__SUPABASE_KEY__';
    } else {
        // Development fallbacks
        window.ENV.SUPABASE_URL = 'https://knacnvnqdvpsfkkrufmo.supabase.co';
        window.ENV.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuYWNudm5xZHZwc2Zra3J1Zm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE5ODY5NTgsImV4cCI6MjA1NzU2Mjk1OH0.hqh11WwHi4oatFJg75JM-TfK5c1ehNIiR7ucasOpTvg';
    }
    
    console.log('Environment initialized:', isProduction ? 'Production' : 'Development');
}

/**
 * Initialize the main app
 * This loads and initializes the main components
 */
function initializeMainApp() {
    try {
        // Load main.js
        import('./main.js').then(module => {
            if (typeof module.setupEventListeners === 'function') {
                module.setupEventListeners();
                console.log('Main app event listeners initialized');
            } else {
                console.warn('setupEventListeners not found in main.js, initializing app directly');
                setupApp();
            }
        }).catch(err => {
            console.error('Failed to load main.js, initializing app directly:', err);
            setupApp();
        });
    } catch (error) {
        console.error('Error initializing main app:', error);
        setupApp();
    }
}

/**
 * Setup app if main.js fails to load
 */
function setupApp() {
    // Initialize basic UI handlers
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.getAttribute('data-view');
            if (view) {
                document.querySelectorAll('.view-container').forEach(container => {
                    container.classList.remove('active');
                });
                document.querySelectorAll('.sidebar-nav-item').forEach(navItem => {
                    navItem.classList.remove('active');
                });
                document.getElementById(`${view}-view`)?.classList.add('active');
                this.classList.add('active');
            }
        });
    });
    
    // Initialize audio player
    new AudioPlayer();
}

/**
 * Initialize Supabase auth UI
 */
function initializeAuthUI() {
    // Create Auth UI instance
    try {
        const client = getClient();
        if (!client) {
            console.error('Supabase client not initialized');
            return;
        }
        
        // Initialize auth UI
        const authUI = new AuthUI();
        console.log('Auth UI initialized');
    } catch (error) {
        console.error('Error initializing Auth UI:', error);
    }
}

/**
 * Detect iOS devices and apply iOS-specific styling
 */
function detectIOSDevice() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        document.documentElement.classList.add('ios-device');
        
        // Set viewport height variables
        setViewportHeight();
        
        // Add event listeners to handle orientation changes and resize events
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', () => {
            // Delay to make sure the browser has finished painting
            setTimeout(setViewportHeight, 200);
        });
        
        // Add event listener for when the page is shown (helps with iOS toolbar changes)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                setTimeout(setViewportHeight, 300);
            }
        });
        
        // Apply iOS-specific meta tags
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
            metaViewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        }
        
        console.log('iOS device detected - applying iOS-specific styles');
    }
    return isIOS;
}

/**
 * Set viewport height CSS variable to handle iOS Safari issues
 */
function setViewportHeight() {
    // Set viewport height CSS variable (to handle iOS Safari issues)
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Add iOS-specific padding to account for the bottom safe area
    const safeAreaBottom = window.innerHeight - document.documentElement.clientHeight;
    if (safeAreaBottom > 0) {
        document.documentElement.style.setProperty('--sab', `${safeAreaBottom}px`);
    }
    
    console.log(`Viewport height set: ${window.innerHeight}px, 1vh = ${vh}px, safe area bottom = ${safeAreaBottom}px`);
}

/**
 * Initialize the application
 */
function initializeApp() {
    // Load environment variables
    loadEnvironmentVariables();
    
    // Detect iOS device and apply iOS-specific styling
    detectIOSDevice();
    
    // Initialize main app first
    initializeMainApp();
    
    // Initialize authentication UI after main app
    setTimeout(() => {
        initializeAuthUI();
    }, 500); // Short delay to ensure DOM is ready
}

// When DOM is fully loaded, initialize the application
document.addEventListener('DOMContentLoaded', initializeApp); 