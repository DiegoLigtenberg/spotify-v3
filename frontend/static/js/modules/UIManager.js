class UIManager {
    constructor() {
        this.elements = {
            playPauseButton: document.getElementById('play-pause'),
            previousButton: document.getElementById('previous'),
            nextButton: document.getElementById('next'),
            progressBar: document.querySelector('.progress-bar'),
            progress: document.querySelector('.progress'),
            currentTimeDisplay: document.getElementById('current-time'),
            totalDurationDisplay: document.getElementById('total-duration'),
            searchInput: document.getElementById('search'),
            currentSongElement: document.getElementById('current-song'),
            currentArtistElement: document.getElementById('current-artist'),
            currentThumbnail: document.getElementById('current-thumbnail'),
            volumeControl: document.querySelector('.volume-slider'),
            volumeProgress: document.querySelector('.volume-progress')
        };

        // Initialize event handlers
        this.onPlayPauseClick = null;
        this.onPreviousClick = null;
        this.onNextClick = null;
        this.onProgressClick = null;
        this.onVolumeChange = null;
        this.onSearch = null;

        this.isDragging = false;
        this.pendingSeek = false;
        this.dragPosition = 0;
        this.lastProgressUpdate = 0; // Track last update time
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Button click handlers
        this.elements.playPauseButton.addEventListener('click', () => {
            if (this.onPlayPauseClick) this.onPlayPauseClick();
        });

        this.elements.previousButton.addEventListener('click', () => {
            if (this.onPreviousClick) this.onPreviousClick();
        });

        this.elements.nextButton.addEventListener('click', () => {
            if (this.onNextClick) this.onNextClick();
        });

        // Progress bar click and drag handlers
        this.elements.progress.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.pendingSeek = false;
            // Store position but don't seek yet
            this.updateDragPosition(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                // Just update position during drag, don't seek
                this.updateDragPosition(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                // Only seek on mouse release
                this.isDragging = false;
                this.executeDragSeek();
            }
        });

        // Volume control click handler
        this.elements.volumeControl.addEventListener('click', (e) => {
            if (this.onVolumeChange) {
                const volumeWidth = this.elements.volumeControl.clientWidth;
                const clickX = e.offsetX;
                const volume = clickX / volumeWidth;
                this.onVolumeChange(volume);
            }
        });

        // Search input handler
        this.elements.searchInput.addEventListener('input', (e) => {
            if (this.onSearch) {
                this.onSearch(e.target.value);
            }
        });
    }

    updateDragPosition(e) {
        if (!this.elements.progress) return;
        
        const rect = this.elements.progress.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        this.dragPosition = Math.max(0, Math.min(1, clickX / rect.width));
        
        // Just update visual position during drag
        this.elements.progressBar.style.width = `${this.dragPosition * 100}%`;
        
        console.log('Dragging progress:', {
            position: this.dragPosition,
            percentage: `${(this.dragPosition * 100).toFixed(2)}%`
        });
    }
    
    executeDragSeek() {
        if (this.onProgressClick) {
            console.log('Executing seek to position:', {
                position: this.dragPosition,
                percentage: `${(this.dragPosition * 100).toFixed(2)}%`
            });
            
            this.onProgressClick(this.dragPosition);
            this.pendingSeek = false;
        }
    }

    updatePlayPauseButton(isPlaying) {
        this.elements.playPauseButton.innerHTML = isPlaying ? 
            '<i class="fas fa-pause"></i>' : 
            '<i class="fas fa-play"></i>';
    }

    updateProgress(currentTime, duration) {
        if (isNaN(currentTime) || isNaN(duration)) {
            console.log('Invalid time values:', { currentTime, duration });
            return;
        }
        
        // Don't update UI while dragging
        if (this.isDragging) {
            return;
        }
        
        // Avoid too frequent updates (debounce)
        const now = Date.now();
        if (now - this.lastProgressUpdate < 50) {
            return;
        }
        this.lastProgressUpdate = now;
        
        const progressPercent = (currentTime / duration) * 100;
        console.log('Updating progress:', {
            currentTime: this.formatTime(currentTime),
            duration: this.formatTime(duration),
            progressPercent: `${progressPercent.toFixed(2)}%`
        });

        this.elements.progressBar.style.width = `${progressPercent}%`;
        this.elements.currentTimeDisplay.textContent = this.formatTime(currentTime);
        this.elements.totalDurationDisplay.textContent = this.formatTime(duration);
    }

    updateVolume(volume) {
        this.elements.volumeProgress.style.width = `${volume * 100}%`;
    }

    updateCurrentSong(song) {
        this.elements.currentSongElement.textContent = song.title;
        this.elements.currentArtistElement.textContent = song.artist || 'Unknown Artist';
        this.elements.currentThumbnail.src = `/api/thumbnail/${song.id}`;
        this.elements.currentThumbnail.onerror = () => {
            this.elements.currentThumbnail.src = '/static/images/default.png';
        };
        document.title = `${song.title} - ${song.artist || 'Unknown Artist'}`;
    }

    createSongElement(song, isPlaying = false) {
        const songElement = document.createElement('div');
        songElement.className = 'song-card';
        songElement.dataset.songId = song.id;
        
        if (isPlaying) {
            songElement.classList.add('playing');
        }
        
        songElement.innerHTML = `
            <img src="/api/thumbnail/${song.id}" 
                 alt="Album Art" 
                 onerror="this.src='/static/images/default.png'">
            <h3>${song.title}</h3>
            <p>${song.artist || 'Unknown Artist'}</p>
        `;
        
        return songElement;
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    showNotification(message, type = 'info') {
        // Remove any existing notifications
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to DOM
        document.body.appendChild(notification);
        
        // Auto-hide after 5 seconds for non-error notifications
        if (type !== 'error') {
            setTimeout(() => {
                notification.classList.add('hide');
                setTimeout(() => notification.remove(), 500);
            }, 5000);
        } else {
            // Add close button for errors
            const closeButton = document.createElement('button');
            closeButton.className = 'notification-close';
            closeButton.innerHTML = '&times;';
            closeButton.addEventListener('click', () => {
                notification.classList.add('hide');
                setTimeout(() => notification.remove(), 500);
            });
            notification.appendChild(closeButton);
            
            // Auto-hide errors after 10 seconds
            setTimeout(() => {
                notification.classList.add('hide');
                setTimeout(() => notification.remove(), 500);
            }, 10000);
        }
    }
}

export default UIManager; 