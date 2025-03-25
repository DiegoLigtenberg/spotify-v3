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
    // More thorough iOS detection, specifically focusing on Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = isIOS && /AppleWebKit/.test(navigator.userAgent) && 
                    !/CriOS/.test(navigator.userAgent) && !/FxiOS/.test(navigator.userAgent);
    
    if (isIOS) {
        // Add appropriate classes
        document.documentElement.classList.add('ios-device');
        if (isSafari) {
            document.documentElement.classList.add('ios-safari');
        }
        
        // Set viewport height variables
        setViewportHeight();
        
        // Add event listeners to handle orientation changes and resize events
        window.addEventListener('resize', handleIOSViewportChanges);
        window.addEventListener('orientationchange', () => {
            // Delay to make sure the browser has finished painting
            setTimeout(() => {
                handleIOSViewportChanges();
                
                // Fix scrolling after orientation change
                setTimeout(fixIOSScrollContainers, 300);
            }, 300);
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                setTimeout(handleIOSViewportChanges, 100);
                setTimeout(fixIOSScrollContainers, 300);
            }
        });
        
        // Apply iOS-specific meta tags
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
            metaViewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        }
        
        // Initial check to ensure player visibility
        setTimeout(ensureIOSPlayerVisibility, 300);
        
        // Fix scrolling in iOS by adding classes to scrollable containers
        document.querySelectorAll('.view-container, #home-view, .songs-container').forEach(container => {
            container.classList.add('ios-scrollable');
            if (container.id === 'home-view') {
                // Make home view the primary scroll container
                container.style.overflowY = 'auto';
                container.style.webkitOverflowScrolling = 'touch';
            }
        });
        
        // Fix initial scroll position
        setTimeout(fixIOSScrollContainers, 500);
        
        // Add event listener for iOS-specific clicks on song cards to ensure scrolling is preserved
        document.addEventListener('click', (e) => {
            const songCard = e.target.closest('.song-card');
            if (songCard) {
                // Save scroll position for active view
                const activeView = document.querySelector('.view-container.active') || document.getElementById('home-view');
                if (activeView) {
                    window._lastIOSScrollPos = activeView.scrollTop;
                    console.log('Saved iOS scroll position on song click:', window._lastIOSScrollPos);
                }
            }
        }, { passive: true });
        
        console.log(`iOS ${isSafari ? 'Safari' : 'browser'} detected - applying iOS-specific styles`);
    }
    return isIOS;
}

/**
 * Handle iOS viewport changes (called on resize, orientation change)
 */
function handleIOSViewportChanges() {
    // Update viewport height
    setViewportHeight();
    
    // Ensure player visibility
    ensureIOSPlayerVisibility();
    
    // Fix scroll containers after viewport changes
    fixIOSScrollContainers();
}

/**
 * Fix scrolling containers after iOS viewport changes
 */
function fixIOSScrollContainers() {
    // Force redraw on scrollable containers
    document.querySelectorAll('.view-container.active, #home-view, .ios-scrollable').forEach(container => {
        if (!container) return;
        
        // Store current scroll position
        const currentScroll = container.scrollTop || 0;
        
        // Force a repaint by changing a style property temporarily
        container.style.display = 'none';
        void container.offsetHeight; // Force repaint
        container.style.display = '';
        
        // Restore scroll position
        if (currentScroll > 0) {
            setTimeout(() => {
                container.scrollTop = currentScroll;
                console.log(`Restored scroll position for ${container.id || container.className}: ${currentScroll}px`);
            }, 50);
        }
    });
    
    // Also ensure player remains visible
    ensureIOSPlayerVisibility();
}

/**
 * Ensure the player is visible on iOS devices
 */
function ensureIOSPlayerVisibility() {
    const player = document.querySelector('.player');
    if (player) {
        // Force player display properties
        player.style.display = 'flex';
        player.style.visibility = 'visible';
        player.style.opacity = '1';
        player.style.transform = 'translateZ(0)';
        
        // Add a specific class to indicate it's been fixed
        if (!player.classList.contains('ios-fixed')) {
            player.classList.add('ios-fixed');
        }
        
        // Log for debugging
        console.log('Ensuring iOS player visibility in ' + 
                    (window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape') + 
                    ' orientation');
        
        // Force reflow/repaint
        void player.offsetHeight;
    } else {
        console.warn('Player element not found when ensuring visibility');
    }
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