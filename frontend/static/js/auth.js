// Event handler for login
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorContainer = document.getElementById('login-error');
    
    if (!email || !password) {
        showError(errorContainer, 'Please enter email and password');
        return;
    }
    
    try {
        const { user, session, error } = await supabase.auth.signIn({ email, password });
        
        if (error) {
            showError(errorContainer, error.message || 'Login failed');
            return;
        }
        
        if (user) {
            localStorage.setItem('auth_token', session.access_token);
            showSuccess(errorContainer, 'Login successful!');
            
            // Refresh liked songs from database
            if (window.musicPlayer && window.musicPlayer.playlistManager) {
                console.log('Refreshing liked songs after login');
                window.musicPlayer.playlistManager.refreshAfterAuthChange();
            }
            
            setTimeout(() => {
                closeModal();
                updateAuthUI();
            }, 1000);
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(errorContainer, 'An unexpected error occurred');
    }
}

// Handle logout
function handleLogout() {
    try {
        supabase.auth.signOut().then(() => {
            localStorage.removeItem('auth_token');
            console.log('Logged out successfully');
            
            // Refresh UI after logout
            if (window.musicPlayer && window.musicPlayer.playlistManager) {
                console.log('Refreshing liked songs after logout');
                window.musicPlayer.playlistManager.refreshAfterAuthChange();
            }
            
            updateAuthUI();
        }).catch(error => {
            console.error('Logout error:', error);
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Check if user is already logged in on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if supabase is available
        if (!supabase || !supabase.auth) {
            console.error('Supabase not initialized for auth check');
            updateAuthUI();
            return;
        }
        
        // Different methods depending on Supabase version
        let user = null;
        
        // Try using getUser method first (newer Supabase versions)
        try {
            const { data } = await supabase.auth.getUser();
            user = data?.user;
        } catch (e) {
            console.log('getUser method failed, trying session method:', e);
            // Fall back to session method (older Supabase versions)
            try {
                const session = supabase.auth.session();
                user = session?.user;
            } catch (e2) {
                console.log('Session method also failed:', e2);
            }
        }
        
        if (user) {
            console.log('User already logged in:', user.email);
            
            // Try to get token safely
            let token = '';
            try {
                const session = supabase.auth.session();
                token = session?.access_token || '';
            } catch (e) {
                console.log('Could not get access token:', e);
            }
            
            localStorage.setItem('auth_token', token);
            
            // Refresh liked songs from database if player is ready
            if (window.musicPlayer && window.musicPlayer.playlistManager) {
                console.log('Refreshing liked songs on page load');
                window.musicPlayer.playlistManager.refreshAfterAuthChange();
            } else {
                // Set a flag to refresh when player is ready
                window.refreshLikedSongsOnReady = true;
            }
        }
        
        updateAuthUI();
    } catch (error) {
        console.error('Auth check error:', error);
        // Still update UI even if auth check fails
        updateAuthUI();
    }
}); 