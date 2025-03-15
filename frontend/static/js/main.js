import AudioPlayer from './modules/AudioPlayer.js';
import SongListManager from './modules/SongListManager.js';
import UIManager from './modules/UIManager.js';
import PlaylistManager from './modules/PlaylistManager.js';

class MusicPlayer {
    constructor() {
        this.currentSong = null;
        this.currentSongIndex = -1;
        this.seekInProgress = false;
        this.shuffleEnabled = false;
        
        console.log('Initializing MusicPlayer components...');
        
        this.audioPlayer = new AudioPlayer();
        this.uiManager = new UIManager();
        this.songListManager = new SongListManager(
            document.querySelector('.songs-container'),
            {
                totalSongs: 70,
                visibleSongs: 30,
                loadChunk: 20,
                scrollThreshold: 0.05,
                cooldownTime: 250
            }
        );
        
        // Initialize playlist manager
        try {
            this.playlistManager = new PlaylistManager();
            console.log('PlaylistManager initialized successfully');
        } catch (error) {
            console.error('Error initializing PlaylistManager:', error);
            this.uiManager.showNotification('Error loading playlists. Some features may not work correctly.', 'error');
        }
        
        this.setupEventListeners();
        this.initializeApplication();
    }

    setupEventListeners() {
        // Audio player events
        this.audioPlayer.addEventListener('timeupdate', () => {
            // Update UI based on our reliable position tracker
            this.uiManager.updateProgress(
                this.audioPlayer.currentTime,
                this.audioPlayer.duration
            );
        });

        this.audioPlayer.addEventListener('ended', () => {
            if (this.shuffleEnabled) {
                this.playRandomSong();
            } else if (this.currentSongIndex < this.songListManager.songs.length - 1) {
                this.playSong(this.songListManager.songs[this.currentSongIndex + 1]);
            }
        });

        this.audioPlayer.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            
            // Get more detailed error information if available
            let errorMessage = 'Error playing the song.';
            if (e.error && e.error.message) {
                errorMessage += ' ' + e.error.message;
            } else if (e.error && e.error.code) {
                // Translate error codes to user-friendly messages
                switch (e.error.code) {
                    case 1: // MEDIA_ERR_ABORTED
                        errorMessage = 'Playback aborted by the system.';
                        break;
                    case 2: // MEDIA_ERR_NETWORK
                        errorMessage = 'Network error occurred during playback. Please check your connection.';
                        break;
                    case 3: // MEDIA_ERR_DECODE
                        errorMessage = 'Unable to decode the audio. The file might be corrupted.';
                        break;
                    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                        errorMessage = 'Audio format not supported by your browser.';
                        break;
                    default:
                        errorMessage = 'Unknown playback error occurred.';
                }
            }
            
            // Show error message to user
            this.uiManager.showNotification(errorMessage, 'error');
            
            // Try again after a short delay for network-related errors
            if (e.error && e.error.code === 2) {
                setTimeout(() => {
                    if (this.currentSongIndex >= 0 && this.songListManager.songs[this.currentSongIndex]) {
                        console.log('Retrying playback after network error...');
                        this.playSong(this.songListManager.songs[this.currentSongIndex]);
                    }
                }, 3000);
            }
        });

        // Listen for play events
        this.audioPlayer.addEventListener('play', () => {
            this.uiManager.updatePlayPauseButton(true);
        });

        // Listen for pause events
        this.audioPlayer.addEventListener('pause', () => {
            this.uiManager.updatePlayPauseButton(false);
        });

        // Listen for seek events
        this.audioPlayer.addEventListener('seek', (e) => {
            console.log('Received seek event with position:', this.formatTime(e.position));
            
            // Update UI immediately with the new position
            this.uiManager.updateProgress(
                e.position,
                this.audioPlayer.duration
            );
            
            this.seekInProgress = false;
        });

        // Add repeat change event listener
        this.audioPlayer.addEventListener('repeatChanged', (e) => {
            console.log('Repeat state changed:', e.isRepeatEnabled);
            this.uiManager.updateRepeatButton(e.isRepeatEnabled);
        });

        // UI event handlers
        this.uiManager.onPlayPauseClick = () => this.handlePlayPause();
        this.uiManager.onPreviousClick = () => this.playPrevious();
        this.uiManager.onNextClick = () => this.playNext();
        
        // Add repeat toggle handler
        this.uiManager.onRepeatToggle = () => this.toggleRepeat();
        
        // Add shuffle toggle handler
        this.uiManager.onShuffleToggle = () => this.toggleShuffle();
        
        // Add like toggle handler
        this.uiManager.onLikeToggle = () => {
            console.log('Like button clicked in UI');
            this.toggleLike();
        };
        
        // Add view change handler
        this.uiManager.onViewChange = (view) => {
            console.log('Changing view to:', view);
            this.changeView(view);
        };
        
        this.uiManager.onProgressClick = (position) => {
            if (!this.currentSong || !this.audioPlayer.duration) return;
            
            // Mark that we're in the middle of a seek operation
            this.seekInProgress = true;
            
            // Calculate the target time
            const seekTime = position * this.audioPlayer.duration;
            console.log('UI Progress click seeking to:', this.formatTime(seekTime));
            
            // Use our reliable seek method
            this.audioPlayer.seek(seekTime);
        };
        this.uiManager.onVolumeChange = (volume) => {
            this.audioPlayer.volume = volume;
            this.uiManager.updateVolume(volume);
        };
        this.uiManager.onSearch = (searchTerm) => {
            const filteredSongs = this.songListManager.filterSongs(searchTerm);
            this.displaySongs(filteredSongs);
        };

        // Override SongListManager's displaySongs method
        this.songListManager.displaySongs = () => {
            this.displaySongs(this.songListManager.songs);
        };
    }

    formatTime(seconds) {
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async initializeApplication() {
        try {
            await this.songListManager.fetchMoreSongs('down');
        } catch (error) {
            console.error('Error initializing application:', error);
            alert('Error loading songs. Please refresh the page.');
        }
    }

    displaySongs(songs) {
        const container = document.querySelector('.songs-container');
        if (!container) {
            console.error('Songs container element not found');
            return;
        }
        
        container.innerHTML = '';
        
        if (songs.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-songs-message';
            emptyMessage.textContent = 'No songs found';
            container.appendChild(emptyMessage);
            return;
        }
        
        songs.forEach(song => {
            const songElement = this.uiManager.createSongElement(
                song,
                this.currentSong && song.id === this.currentSong.id
            );
            songElement.addEventListener('click', () => this.playSong(song));
            container.appendChild(songElement);
        });
    }

    async playSong(song) {
        try {
            if (!song || !song.id) {
                console.error('Invalid song data:', song);
                return;
            }
            
            console.log('Playing song:', song.title);
            
            // Store current song and index for potential retries
            this.currentSong = song;
            this.currentSongIndex = this.songListManager.songs.findIndex(s => s.id === song.id);
            
            // Update UI to show loading state
            this.uiManager.updateCurrentSong(song);
            this.uiManager.showNotification('Loading song...', 'info');
            
            // Check if song is liked and update heart icon
            this.updateLikeStatus(song.id);
            
            // Build the URL for streaming the song - with fallback options
            const streamEndpoints = [
                `/api/stream/${song.id}`,
                `/static/audio/${song.id}.mp3`,
                `/static/audio/sample.mp3` // Fallback to a default sample if needed
            ];
            
            let attempts = 0;
            const maxAttempts = streamEndpoints.length;
            let success = false;
            let lastError = null;
            
            while (attempts < maxAttempts && !success) {
                try {
                    attempts++;
                    
                    const songUrl = streamEndpoints[attempts - 1] + (attempts > 1 ? `?retry=${Date.now()}` : '');
                        
                    console.log(`Playing song: ${song.title} (attempt ${attempts}/${maxAttempts}) from ${songUrl}`);
                    
                    // Add a timeout for loading the song
                    const playPromise = this.audioPlayer.play(songUrl);
                    
                    // Use Promise.race to implement a timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Playback timed out')), 10000);
                    });
                    
                    await Promise.race([playPromise, timeoutPromise]);
                    
                    // If we get here, playback started successfully
                    success = true;
                    
                    // Update UI elements
                    this.updateSongInfo(song);
                    
                    // Show success notification on retries
                    if (attempts > 1) {
                        this.uiManager.showNotification('Playback started successfully!', 'success');
                    }
                    
                } catch (error) {
                    console.error(`Attempt ${attempts} with URL ${streamEndpoints[attempts - 1]} failed:`, error);
                    lastError = error;
                    
                    if (attempts >= maxAttempts) {
                        // We've exhausted our retries
                        this.uiManager.showNotification(
                            `Failed to play song after ${maxAttempts} attempts. Please try again later.`, 
                            'error'
                        );
                        throw lastError;
                    } else {
                        // Retry with different endpoint
                        this.uiManager.showNotification(
                            `Playback failed. Trying alternate source... (${attempts}/${maxAttempts})`, 
                            'warning'
                        );
                        // Add a short delay before retry
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
        } catch (error) {
            console.error('Error in playSong:', error);
            this.uiManager.showNotification('Failed to play song. Please try again.', 'error');
        }
    }

    handlePlayPause() {
        if (!this.currentSong) return;
        
        if (this.audioPlayer.paused) {
            this.audioPlayer.resume()
                .then(() => this.uiManager.updatePlayPauseButton(true))
                .catch(error => {
                    console.error('Error playing song:', error);
                    this.uiManager.updatePlayPauseButton(false);
                });
        } else {
            this.audioPlayer.pause();
            this.uiManager.updatePlayPauseButton(false);
        }
    }

    playPrevious() {
        if (this.currentSongIndex > 0) {
            this.playSong(this.songListManager.songs[this.currentSongIndex - 1]);
        }
    }

    playNext() {
        if (this.currentSongIndex < this.songListManager.songs.length - 1) {
            this.playSong(this.songListManager.songs[this.currentSongIndex + 1]);
        }
    }

    updateSongInfo(song) {
        if (!song) return;
        
        // Store current song
        this.currentSong = song;
        
        // Update UI elements
        this.uiManager.updateCurrentSong(song);
        this.uiManager.updatePlayPauseButton(true);
        
        // Set the initial like state using our new method
        if (this.playlistManager) {
            this.playlistManager.setInitialLikeState(
                song.id, 
                song.title, 
                song.artist
            );
        } else {
            // Fallback to the old method if playlistManager is not available
            this.updateLikeStatus(song.id);
        }
        
        // Update the document title
        document.title = `${song.title} - ${song.artist || 'Unknown Artist'}`;
        
        // Load songs around current song for better UX
        this.songListManager.loadSongsAroundIndex(this.currentSongIndex)
            .catch(err => console.error('Error loading songs around current index:', err));
    }

    // Toggle repeat mode
    toggleRepeat() {
        const isRepeatEnabled = this.audioPlayer.toggleRepeat();
        console.log(`Repeat mode ${isRepeatEnabled ? 'enabled' : 'disabled'}`);
        // UI is updated via the repeatChanged event
    }
    
    // Toggle shuffle mode
    toggleShuffle() {
        this.shuffleEnabled = !this.shuffleEnabled;
        console.log(`Shuffle mode ${this.shuffleEnabled ? 'enabled' : 'disabled'}`);
        this.uiManager.updateShuffleButton(this.shuffleEnabled);
    }
    
    // Toggle like status
    toggleLike() {
        if (!this.currentSong) {
            this.uiManager.showNotification('No song is currently playing', 'info');
            return;
        }
        
        console.log('Toggling like status for current song:', this.currentSong.title);
        
        // Call the playlistManager's toggleLike method if available
        if (this.playlistManager) {
            try {
                this.playlistManager.toggleLike();
                
                // Update UI after toggle
                setTimeout(() => {
                    // Check if the song is now liked
                    this.updateLikeStatus(this.currentSong.id);
                }, 100); // Small delay to allow toggle to complete
            } catch (error) {
                console.error('Error toggling like status:', error);
                this.uiManager.showNotification('Error updating like status', 'error');
            }
        } else {
            console.error('PlaylistManager not available');
            this.uiManager.showNotification('Unable to like song: playlist manager not initialized', 'error');
        }
    }
    
    // Update like button based on current song
    updateLikeStatus(songId) {
        if (!this.playlistManager) {
            console.warn('Cannot update like status: PlaylistManager not available');
            return;
        }
        
        if (!this.currentSong) {
            console.warn('Cannot update like status: No current song');
            return;
        }
        
        try {
            // Check if we have a UI manager to update
            if (!this.uiManager) return;
            
            console.log('Checking if song is liked:', {
                title: this.currentSong.title,
                artist: this.currentSong.artist,
                id: songId
            });
            
            // Let's directly check the actual UI state of the like button
            const likeButton = document.getElementById('like-current-song');
            const isLiked = likeButton ? likeButton.classList.contains('liked') : false;
            
            console.log('Current like button state:', isLiked);
            
            // Update our UI
            this.uiManager.updateLikeButton(isLiked);
        } catch (error) {
            console.error('Error updating like status:', error);
        }
    }
    
    // Change the current view
    changeView(view) {
        console.log('Changing to view:', view);
        this.uiManager.showView(view);
    }

    // Play a random song (for shuffle mode)
    playRandomSong() {
        const availableSongs = this.songListManager.songs;
        if (availableSongs.length === 0) return;
        
        // Don't play the current song again
        const filteredSongs = availableSongs.filter(song => 
            !this.currentSong || song.id !== this.currentSong.id
        );
        
        if (filteredSongs.length === 0) {
            // If there's only one song, play it again
            this.playSong(this.currentSong);
            return;
        }
        
        // Pick a random song
        const randomIndex = Math.floor(Math.random() * filteredSongs.length);
        const randomSong = filteredSongs[randomIndex];
        
        this.playSong(randomSong);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing MusicPlayer...');
    try {
        window.musicPlayer = new MusicPlayer();
    } catch (error) {
        console.error('Error initializing music player:', error);
        alert('Error initializing the music player. Please refresh the page.');
    }
}); 