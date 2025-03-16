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
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            console.log('User already logged in:', user.email);
            localStorage.setItem('auth_token', supabase.auth.session()?.access_token || '');
            
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
    }
}); 