/**
 * Supabase Authentication UI module.
 * Provides UI components and handlers for authentication.
 */

import { signUp, signIn, signOut, getCurrentUser, onAuthStateChange, signInWithProvider, isAuthenticated } from './auth.js';

// HTML template for auth modal
const authModalTemplate = `
<div class="auth-modal">
    <div class="auth-modal-content">
        <span class="auth-close">&times;</span>
        <div class="auth-tabs">
            <button class="auth-tab-btn active" data-tab="login">Login</button>
            <button class="auth-tab-btn" data-tab="signup">Sign Up</button>
        </div>
        
        <div class="auth-tab-content active" id="login-tab">
            <form id="login-form" class="auth-form">
                <div class="auth-form-group">
                    <label for="login-email">Email</label>
                    <input type="email" id="login-email" required placeholder="your@email.com">
                </div>
                <div class="auth-form-group">
                    <label for="login-password">Password</label>
                    <input type="password" id="login-password" required placeholder="Your password">
                </div>
                <div class="auth-error" id="login-error"></div>
                <button type="submit" class="auth-submit-btn">Login</button>
            </form>
            
            <div class="auth-divider">
                <span>OR</span>
            </div>
            
            <div class="auth-providers">
                <button class="auth-provider-btn" data-provider="google">
                    <i class="fab fa-google"></i> Continue with Google
                </button>
                <button class="auth-provider-btn" data-provider="github">
                    <i class="fab fa-github"></i> Continue with GitHub
                </button>
            </div>
        </div>
        
        <div class="auth-tab-content" id="signup-tab">
            <form id="signup-form" class="auth-form">
                <div class="auth-form-group">
                    <label for="signup-email">Email</label>
                    <input type="email" id="signup-email" required placeholder="your@email.com">
                </div>
                <div class="auth-form-group">
                    <label for="signup-password">Password</label>
                    <input type="password" id="signup-password" required placeholder="Choose a password">
                </div>
                <div class="auth-error" id="signup-error"></div>
                <button type="submit" class="auth-submit-btn">Sign Up</button>
            </form>
            
            <div class="auth-divider">
                <span>OR</span>
            </div>
            
            <div class="auth-providers">
                <button class="auth-provider-btn" data-provider="google">
                    <i class="fab fa-google"></i> Continue with Google
                </button>
                <button class="auth-provider-btn" data-provider="github">
                    <i class="fab fa-github"></i> Continue with GitHub
                </button>
            </div>
        </div>
    </div>
</div>
`;

// Template for the auth UI in the sidebar
const authUITemplate = `
<div class="auth-ui">
    <div class="logged-out-view">
        <button id="auth-login-btn" class="auth-button">Login / Sign Up</button>
    </div>
    <div class="logged-in-view" style="display: none;">
        <div class="user-profile">
            <div class="user-avatar">
                <i class="fas fa-user-circle"></i>
            </div>
            <div class="user-info">
                <div class="user-email"></div>
            </div>
        </div>
        <button id="auth-logout-btn" class="auth-button">Logout</button>
    </div>
</div>
`;

class AuthUI {
    constructor() {
        this.initializeUI();
        this.setupAuthStateListener();
    }
    
    /**
     * Initialize the auth UI by setting up event listeners
     */
    initializeUI() {
        this.setupWelcomeScreen();
        this.setupAuthModal();
        this.setupEventListeners();
        console.log('Auth UI initialized');
    }
    
    /**
     * Set up the welcome screen for unauthenticated users
     */
    async setupWelcomeScreen() {
        const welcomeOverlay = document.getElementById('welcome-overlay');
        if (!welcomeOverlay) {
            console.error('Welcome overlay element not found');
            return;
        }
        
        // Check if user is authenticated
        const authenticated = await isAuthenticated();
        
        if (authenticated) {
            // Hide welcome screen if user is authenticated
            welcomeOverlay.style.display = 'none';
        } else {
            // Show welcome screen
            welcomeOverlay.style.display = 'flex';
        }
    }
    
    /**
     * Set up the auth modal
     */
    setupAuthModal() {
        const authModal = document.getElementById('auth-modal');
        if (!authModal) {
            console.error('Auth modal element not found');
            return;
        }
    }
    
    /**
     * Set up event listeners for auth UI elements
     */
    setupEventListeners() {
        // Welcome screen login button
        const welcomeLoginBtn = document.getElementById('welcome-login-btn');
        if (welcomeLoginBtn) {
            welcomeLoginBtn.addEventListener('click', () => {
                this.showAuthModal('login');
            });
        }
        
        // Welcome screen signup button
        const welcomeSignupBtn = document.getElementById('welcome-signup-btn');
        if (welcomeSignupBtn) {
            welcomeSignupBtn.addEventListener('click', () => {
                this.showAuthModal('signup');
            });
        }
        
        // Auth modal close button
        const closeBtn = document.querySelector('.auth-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideAuthModal());
        }
        
        // Tab switching
        const tabBtns = document.querySelectorAll('.auth-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all tabs
                document.querySelectorAll('.auth-tab-btn').forEach(b => 
                    b.classList.remove('active'));
                document.querySelectorAll('.auth-tab-content').forEach(c => 
                    c.classList.remove('active'));
                
                // Add active class to clicked tab
                e.target.classList.add('active');
                const tabName = e.target.dataset.tab;
                document.getElementById(`${tabName}-tab`).classList.add('active');
            });
        });
        
        // Form submissions
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }
        
        const signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSignup();
            });
        }
        
        // Provider buttons
        const providerBtns = document.querySelectorAll('.auth-provider-btn');
        providerBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const provider = e.target.closest('.auth-provider-btn').dataset.provider;
                this.handleProviderLogin(provider);
            });
        });
        
        // Close modal when clicking outside
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            window.addEventListener('click', (e) => {
                if (e.target === authModal) {
                    this.hideAuthModal();
                }
            });
        }
    }
    
    /**
     * Set up listener for authentication state changes
     */
    setupAuthStateListener() {
        onAuthStateChange((event, session) => {
            this.handleAuthStateChange(event, session);
        });
        
        // Check initial auth state
        this.checkAuthState();
    }
    
    /**
     * Check current authentication state and update UI
     * @param {boolean} isInitialCheck - Whether this is the initial check on page load
     */
    async checkAuthState(isInitialCheck = true) {
        try {
            const user = await getCurrentUser();
            
            if (user) {
                // Hide any loading indicator that might be visible
                this._hideLoadingIndicator();
                
                // If user is logged in, update UI accordingly
                this.updateUIForUser(user);
                this.hideAuthModal();
                this.hideWelcomeScreen();
                
                // Only load liked songs on initial check to avoid duplication
                if (isInitialCheck) {
                    this.refreshUserLikedSongs();
                }
            } else {
                // If this is not the initial check, it might be during a login attempt
                // In that case, we don't want to show the welcome screen immediately
                if (isInitialCheck) {
                    this.updateUIForLoggedOut();
                    this.showWelcomeScreen();
                }
            }
        } catch (error) {
            console.error('Error checking auth state:', error);
            
            // On error, ensure loading indicator is hidden
            this._hideLoadingIndicator();
            
            // Only show welcome screen on initial check
            if (isInitialCheck) {
                this.updateUIForLoggedOut();
                this.showWelcomeScreen();
            }
        }
    }
    
    /**
     * Handle auth state changes
     * @param {string} event - Auth event name
     * @param {object} session - Auth session data
     */
    handleAuthStateChange(event, session) {
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_IN') {
            // Don't show welcome screen during transition
            this._hideLoadingIndicator();
            this.updateUIForUser(session.user);
            this.hideAuthModal();
            this.hideWelcomeScreen();
            
            // Use smooth transition for UI changes
            this._smoothTransitionToLoggedIn();
            
            // Refresh the user's liked songs from the database
            this.refreshUserLikedSongs();
            
            // Notify parent container
            if (typeof window.onAuthStateChange === 'function') {
                window.onAuthStateChange(true, session);
            }
        } else if (event === 'SIGNED_OUT') {
            this.updateUIForLoggedOut();
            this.showWelcomeScreen();
            
            // Notify parent container
            if (typeof window.onAuthStateChange === 'function') {
                window.onAuthStateChange(false);
            }
            
            // Clear any user-specific data
            this.clearUserData();
        }
    }
    
    /**
     * Perform a smooth transition to logged in state
     * @private
     */
    _smoothTransitionToLoggedIn() {
        // Add any smooth transition effects here
        // For example, fade in the logged-in view
        const loggedInView = document.querySelector('.logged-in-view');
        if (loggedInView) {
            // First make sure it's displayed
            loggedInView.style.display = 'block';
            
            // Then add a fade-in effect
            loggedInView.style.opacity = '0';
            loggedInView.style.transition = 'opacity 0.5s ease';
            
            // Force a reflow to ensure the transition applies
            void loggedInView.offsetWidth;
            
            // Fade in
            loggedInView.style.opacity = '1';
        }
        
        // Ensure logged-out view is hidden
        const loggedOutView = document.querySelector('.logged-out-view');
        if (loggedOutView) {
            loggedOutView.style.display = 'none';
        }
    }
    
    /**
     * Refresh the user's liked songs from the database
     */
    refreshUserLikedSongs() {
        if (window.app && window.app.playlistManager) {
            console.log('Refreshing liked songs from database');
            window.app.playlistManager._loadLikedSongsFromDatabase()
                .catch(error => {
                    console.error('Error refreshing liked songs:', error);
                });
        }
    }
    
    /**
     * Clear user-specific data when logging out
     */
    clearUserData() {
        console.log('Clearing user data on logout');
        
        // Clear liked songs
        if (window.app && window.app.playlistManager) {
            console.log('Resetting liked songs array');
            window.app.playlistManager.likedSongs = [];
            window.app.playlistManager._saveToStorage();
            window.app.playlistManager._renderLikedSongs();
        } else if (window.playlistManager) {
            console.log('Resetting liked songs via global playlistManager');
            window.playlistManager.likedSongs = [];
            window.playlistManager._saveToStorage();
            window.playlistManager._renderLikedSongs();
        }
        
        // Reset UI states that might show user-specific data
        document.querySelectorAll('.heart-icon.fas, .fa-heart.fas').forEach(icon => {
            icon.classList.remove('fas');
            icon.classList.add('far');
            const btn = icon.closest('button');
            if (btn) btn.classList.remove('liked');
        });
        
        // Clear any other user-specific data in localStorage
        // But keep app preferences and settings
        const keysToKeep = ['volume', 'theme', 'quality_preference'];
        const keysToRemove = [];
        
        // Find keys that might contain user data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !keysToKeep.includes(key) && 
                (key.includes('liked') || key.includes('playlist') || 
                key.includes('history') || key.includes('user'))) {
                keysToRemove.push(key);
            }
        }
        
        // Remove identified keys
        keysToRemove.forEach(key => {
            console.log(`Removing localStorage key: ${key}`);
            localStorage.removeItem(key);
        });
    }
    
    /**
     * Update UI for authenticated user
     * @param {Object} user - User object
     */
    updateUIForUser(user) {
        // Hide welcome screen
        this.hideWelcomeScreen();
        
        // Update the user profile button
        const userProfileButton = document.querySelector('.user-profile-button');
        const userNameElement = document.querySelector('.user-name');
        const userEmailElement = document.querySelector('.user-email');
        
        if (userProfileButton && userNameElement && userEmailElement) {
            userProfileButton.classList.remove('hidden');
            
            // Set user's name or email if available
            const displayName = user.user_metadata?.name || user.email?.split('@')[0] || 'User';
            userNameElement.textContent = displayName;
            
            // Set tooltip with full name
            userNameElement.title = displayName;
            
            // Set full email in dropdown
            userEmailElement.textContent = user.email || 'No email available';
            
            // Make sure we remove old event listeners before adding new ones
            const newUserProfileButton = userProfileButton.cloneNode(true);
            userProfileButton.parentNode.replaceChild(newUserProfileButton, userProfileButton);
            
            // Set up dropdown toggle and event listeners
            this.setupUserProfileDropdown();
        }
        
        console.log('User authenticated:', user.email);
    }
    
    /**
     * Update UI for logged out state
     */
    updateUIForLoggedOut() {
        // Show welcome screen
        this.showWelcomeScreen();
        
        // Hide the user profile button
        const userProfileButton = document.querySelector('.user-profile-button');
        
        if (userProfileButton) {
            userProfileButton.classList.add('hidden');
        }
    }
    
    /**
     * Show the welcome screen
     */
    showWelcomeScreen() {
        const welcomeOverlay = document.getElementById('welcome-overlay');
        if (welcomeOverlay) {
            welcomeOverlay.style.display = 'flex';
        }
    }
    
    /**
     * Hide the welcome screen
     */
    hideWelcomeScreen() {
        const welcomeOverlay = document.getElementById('welcome-overlay');
        if (welcomeOverlay) {
            welcomeOverlay.style.display = 'none';
        }
    }
    
    /**
     * Show the authentication modal
     * @param {string} tab - The tab to show ('login' or 'signup')
     */
    showAuthModal(tab = 'login') {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('active');
            
            // Set active tab
            if (tab) {
                document.querySelectorAll('.auth-tab-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.tab === tab);
                });
                
                document.querySelectorAll('.auth-tab-content').forEach(content => {
                    content.classList.toggle('active', content.id === `${tab}-tab`);
                });
            }
        }
    }
    
    /**
     * Hide the authentication modal
     */
    hideAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    /**
     * Handle login form submission
     */
    async handleLogin() {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const errorEl = document.getElementById('login-error');
        
        if (!emailInput || !passwordInput) return;
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            errorEl.textContent = 'Please enter both email and password';
            return;
        }
        
        try {
            errorEl.textContent = ''; // Clear previous errors
            
            // Disable form while submitting
            this.setFormDisabled('login-form', true);
            
            // Show a loading state on the button
            const submitBtn = document.querySelector('#login-form .auth-submit-btn');
            if (submitBtn) {
                submitBtn.textContent = 'Logging in...';
                submitBtn.disabled = true;
            }
            
            // Hide the auth modal immediately before the actual login
            // This prevents the modal from flashing after auth state changes
            this.hideAuthModal();
            
            // Show a temporary loading indicator
            this._showLoadingIndicator();
            
            const { user, error } = await signIn(email, password);
            
            if (error) {
                // Show the modal again if there's an error
                this.showAuthModal('login');
                errorEl.textContent = error.message || 'Login failed';
                
                // Restore the button
                if (submitBtn) {
                    submitBtn.textContent = 'Login';
                    submitBtn.disabled = false;
                }
            } else if (user) {
                // Success - UI will be updated by the auth state listener
                console.log('Login successful');
                
                // The modal is already hidden, and the auth state listener
                // will handle showing the logged-in state
            }
        } catch (err) {
            // Show the modal again on error
            this.showAuthModal('login');
            errorEl.textContent = 'An unexpected error occurred';
            console.error('Login error:', err);
        } finally {
            this.setFormDisabled('login-form', false);
            this._hideLoadingIndicator();
        }
    }
    
    /**
     * Show a loading indicator
     * @private
     */
    _showLoadingIndicator() {
        // Create a loading indicator if it doesn't exist
        let loader = document.getElementById('auth-loading-indicator');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'auth-loading-indicator';
            loader.className = 'auth-loading-indicator';
            loader.innerHTML = '<div class="spinner"></div><p>Logging in...</p>';
            
            // Style the loader
            loader.style.position = 'fixed';
            loader.style.top = '0';
            loader.style.left = '0';
            loader.style.width = '100%';
            loader.style.height = '100%';
            loader.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            loader.style.display = 'flex';
            loader.style.flexDirection = 'column';
            loader.style.justifyContent = 'center';
            loader.style.alignItems = 'center';
            loader.style.zIndex = '9999';
            loader.style.color = 'white';
            
            // Style the spinner
            const spinner = loader.querySelector('.spinner');
            spinner.style.width = '40px';
            spinner.style.height = '40px';
            spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
            spinner.style.borderTop = '4px solid #1DB954'; // Spotify green
            spinner.style.borderRadius = '50%';
            spinner.style.animation = 'spin 1s linear infinite';
            
            // Add keyframes for the animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(loader);
        } else {
            loader.style.display = 'flex';
        }
    }
    
    /**
     * Hide the loading indicator
     * @private
     */
    _hideLoadingIndicator() {
        const loader = document.getElementById('auth-loading-indicator');
        if (loader) {
            loader.style.display = 'none';
        }
    }
    
    /**
     * Handle signup form submission
     */
    async handleSignup() {
        const emailInput = document.getElementById('signup-email');
        const passwordInput = document.getElementById('signup-password');
        const errorEl = document.getElementById('signup-error');
        
        if (!emailInput || !passwordInput) return;
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            errorEl.textContent = 'Please enter both email and password';
            return;
        }
        
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }
        
        try {
            errorEl.textContent = ''; // Clear previous errors
            
            // Disable form while submitting
            this.setFormDisabled('signup-form', true);
            
            const { user, error } = await signUp(email, password);
            
            if (error) {
                errorEl.textContent = error.message || 'Signup failed';
            } else if (user) {
                // Success - show confirmation message
                const formEl = document.getElementById('signup-form');
                if (formEl) {
                    formEl.innerHTML = `
                        <div class="auth-success">
                            <i class="fas fa-check-circle"></i>
                            <p>Successfully signed up!</p>
                            <p class="auth-success-sub">Please check your email for a confirmation link.</p>
                        </div>
                    `;
                }
            }
        } catch (err) {
            errorEl.textContent = 'An unexpected error occurred';
            console.error('Signup error:', err);
        } finally {
            this.setFormDisabled('signup-form', false);
        }
    }
    
    /**
     * Handle third-party provider login
     * @param {string} provider - Provider name (google, github, etc.)
     */
    async handleProviderLogin(provider) {
        // Clear any previous errors
        const loginError = document.getElementById('login-error');
        const signupError = document.getElementById('signup-error');
        if (loginError) loginError.textContent = '';
        if (signupError) signupError.textContent = '';
        
        // Show loading state on the button
        const button = document.querySelector(`.auth-provider-btn[data-provider="${provider}"]`);
        if (button) {
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
            button.disabled = true;
            
            try {
                await signInWithProvider(provider);
                // The browser will be redirected to the provider's page
            } catch (err) {
                console.error(`Error with ${provider} login:`, err);
                
                // Display appropriate error message
                let errorMessage = 'An error occurred. Please try again.';
                
                if (err.message && err.message.includes('not enabled')) {
                    if (provider === 'google') {
                        errorMessage = 'Google login failed. Please ensure you\'ve allowed popup windows and cookies.';
                    } else {
                        errorMessage = `${provider.charAt(0).toUpperCase() + provider.slice(1)} login is not currently enabled. Please use email/password or Google login.`;
                    }
                } else if (err.message) {
                    errorMessage = err.message;
                }
                
                // Show error in both tabs to ensure visibility
                if (loginError) loginError.textContent = errorMessage;
                if (signupError) signupError.textContent = errorMessage;
                
                // Reset button
                button.innerHTML = originalText;
                button.disabled = false;
            }
        }
    }
    
    /**
     * Handle logout button click
     */
    async handleLogout() {
        try {
            // Stop any playing audio and clear current song before logging out
            if (window.app) {
                console.log('Stopping music completely before logout');
                
                // Reset the audio player state and clear all playback
                if (window.app.audioPlayer) {
                    // Remove event listeners first to prevent any auto-playing
                    window.app.audioPlayer.removeAllEventListeners('ended');
                    
                    // Reset the player completely
                    window.app.audioPlayer.reset();
                }
                
                // Clear app state to prevent auto-play of next song
                window.app.currentSong = null;
                window.app.isPlaying = false;
                
                // Update UI to reflect stopped state
                if (window.app.uiManager) {
                    window.app.uiManager.updatePlayPauseButton(false);
                }
            }
            
            const { error } = await signOut();
            if (error) {
                console.error('Logout error:', error);
            } else {
                // UI will be updated by the auth state listener
                console.log('Logged out successfully');
                
                // Force reload the page to ensure clean state after a short delay
                // This ensures the user sees the "logged out" message before reload
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            }
        } catch (err) {
            console.error('Logout error:', err);
        }
    }
    
    /**
     * Enable or disable a form while submitting
     * @param {string} formId - ID of the form to disable
     * @param {boolean} disabled - Whether to disable or enable the form
     */
    setFormDisabled(formId, disabled) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        const inputs = form.querySelectorAll('input, button');
        inputs.forEach(input => {
            input.disabled = disabled;
        });
        
        // Add loading indicator to submit button if disabled
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            if (disabled) {
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            } else {
                submitBtn.textContent = formId === 'login-form' ? 'Log In' : 'Create Account';
            }
        }
    }
    
    /**
     * Set up the user profile dropdown functionality
     */
    setupUserProfileDropdown() {
        const userProfileButton = document.querySelector('.user-profile-button');
        const logoutButton = document.querySelector('.user-menu-item.logout-button');
        const accountLink = document.querySelector('.user-menu-item.account-link');
        
        if (!userProfileButton) return;
        
        // Toggle dropdown when clicking the profile button
        userProfileButton.addEventListener('click', (e) => {
            e.stopPropagation();
            userProfileButton.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userProfileButton.contains(e.target)) {
                userProfileButton.classList.remove('active');
            }
        });
        
        // Handle logout button click
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
        
        // Handle account link click (if implemented)
        if (accountLink) {
            accountLink.addEventListener('click', (e) => {
                e.preventDefault();
                userProfileButton.classList.remove('active');
                // Add account page navigation logic here
                console.log('Navigate to account page');
            });
        }
    }
}

// Export the AuthUI class
export default AuthUI; 