import AudioPlayer from './modules/AudioPlayer.js';
import SongListManager from './modules/SongListManager.js';
import UIManager from './modules/UIManager.js';

class MusicPlayer {
    constructor() {
        this.currentSong = null;
        this.currentSongIndex = -1;
        this.seekInProgress = false;
        
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
            if (this.currentSongIndex < this.songListManager.songs.length - 1) {
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

        // UI event handlers
        this.uiManager.onPlayPauseClick = () => this.handlePlayPause();
        this.uiManager.onPreviousClick = () => this.playPrevious();
        this.uiManager.onNextClick = () => this.playNext();
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
        container.innerHTML = '';
        
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
            
            // Store current song and index for potential retries
            this.currentSong = song;
            this.currentSongIndex = this.songListManager.songs.findIndex(s => s.id === song.id);
            
            // Update UI to show loading state
            this.uiManager.updateCurrentSong(song);
            this.uiManager.showNotification('Loading song...', 'info');
            
            // Build the URL for streaming the song
            const originalUrl = `/api/stream/${song.id}`;
            let attempts = 0;
            const maxAttempts = 2;
            let success = false;
            
            while (attempts < maxAttempts && !success) {
                try {
                    attempts++;
                    
                    // Add random parameter to avoid caching if this is a retry
                    const songUrl = attempts > 1 
                        ? `${originalUrl}?retry=${Date.now()}` 
                        : originalUrl;
                        
                    console.log(`Playing song: ${song.title} (attempt ${attempts}/${maxAttempts}) from ${songUrl}`);
                    
                    // Add a timeout for loading the song
                    const playPromise = this.audioPlayer.play(songUrl);
                    
                    // Use Promise.race to implement a timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Playback timed out')), 20000);
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
                    console.error(`Attempt ${attempts} failed:`, error);
                    
                    if (attempts >= maxAttempts) {
                        // We've exhausted our retries
                        this.uiManager.showNotification(
                            `Failed to play song after ${maxAttempts} attempts. Please try again later.`, 
                            'error'
                        );
                        throw error;
                    } else {
                        // Retry with slightly different parameters
                        this.uiManager.showNotification(
                            `Playback failed. Retrying... (${attempts}/${maxAttempts})`, 
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
        
        // Load songs around current song for better UX
        this.songListManager.loadSongsAroundIndex(this.currentSongIndex)
            .catch(err => console.error('Error loading songs around current index:', err));
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
}); 