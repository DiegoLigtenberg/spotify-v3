class UIManager {
    constructor() {
        this.elements = {
            playPauseButton: document.getElementById('play-pause'),
            previousButton: document.getElementById('prev') || document.getElementById('previous'),
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
            volumeProgress: document.querySelector('.volume-progress'),
            repeatButton: document.getElementById('repeat') || document.getElementById('repeat-button'),
            likeButton: document.getElementById('like-current-song'),
            shuffleButton: document.getElementById('shuffle'),
            sidebarLinks: document.querySelectorAll('.sidebar-nav-item'),
            viewContainers: document.querySelectorAll('.view-container')
        };

        // Initialize event handlers
        this.onPlayPauseClick = null;
        this.onPreviousClick = null;
        this.onNextClick = null;
        this.onProgressClick = null;
        this.onVolumeChange = null;
        this.onSearch = null;
        this.onRepeatToggle = null;
        this.onShuffleToggle = null;
        this.onLikeToggle = null;
        this.onViewChange = null;

        this.isDragging = false;
        this.pendingSeek = false;
        this.dragPosition = 0;
        this.lastProgressUpdate = 0; // Track last update time
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Button click handlers
        if (this.elements.playPauseButton) {
            this.elements.playPauseButton.addEventListener('click', () => {
                if (this.onPlayPauseClick) this.onPlayPauseClick();
            });
        }

        if (this.elements.previousButton) {
            this.elements.previousButton.addEventListener('click', () => {
                if (this.onPreviousClick) this.onPreviousClick();
            });
        }

        if (this.elements.nextButton) {
            this.elements.nextButton.addEventListener('click', () => {
                if (this.onNextClick) this.onNextClick();
            });
        }
        
        // Add repeat button click handler
        if (this.elements.repeatButton) {
            this.elements.repeatButton.addEventListener('click', () => {
                if (this.onRepeatToggle) this.onRepeatToggle();
            });
        }
        
        // Add shuffle button click handler
        if (this.elements.shuffleButton) {
            this.elements.shuffleButton.addEventListener('click', () => {
                if (this.onShuffleToggle) this.onShuffleToggle();
            });
        }
        
        // Add like button click handler
        if (this.elements.likeButton) {
            this.elements.likeButton.addEventListener('click', () => {
                if (this.onLikeToggle) this.onLikeToggle();
            });
        }

        // Progress bar click and drag handlers
        if (this.elements.progress) {
            this.elements.progress.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.pendingSeek = false;
                // Store position but don't seek yet
                this.updateDragPosition(e);
            });
            
            // Add mousemove handler to track cursor position for the circle indicator
            this.elements.progress.addEventListener('mousemove', (e) => {
                if (!this.isDragging) {
                    // Update the position of the hover circle
                    const rect = this.elements.progress.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    this._updateHoverPosition(percent);
                }
            });
            
            // Remove the hover circle when mouse leaves
            this.elements.progress.addEventListener('mouseleave', () => {
                // Remove any hover circle
                this._removeHoverCircle();
            });
        }

        // Continue with existing event listeners...
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
        if (this.elements.volumeControl) {
            this.elements.volumeControl.addEventListener('click', (e) => {
                if (this.onVolumeChange) {
                    const volumeWidth = this.elements.volumeControl.clientWidth;
                    const clickX = e.offsetX;
                    const volume = clickX / volumeWidth;
                    this.onVolumeChange(volume);
                }
            });
        }

        // Search input handler
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                if (this.onSearch) {
                    this.onSearch(e.target.value);
                }
            });
        }
        
        // Sidebar navigation event listeners
        if (this.elements.sidebarLinks) {
            this.elements.sidebarLinks.forEach(link => {
                if (link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        
                        // Get the view to show from data attribute
                        const view = link.getAttribute('data-view');
                        
                        if (view && this.onViewChange) {
                            this.onViewChange(view);
                            
                            // Update active state
                            this.elements.sidebarLinks.forEach(l => l.classList.remove('active'));
                            link.classList.add('active');
                        }
                    });
                }
            });
        }
    }
    
    // Add methods to manage the hover circle
    _updateHoverPosition(percent) {
        // Remove existing hover circle
        this._removeHoverCircle();
        
        // Create the hover circle at the cursor position
        const circle = document.createElement('div');
        circle.className = 'progress-hover-circle';
        circle.style.left = `${percent * 100}%`;
        
        // Add it to the progress bar
        this.elements.progress.appendChild(circle);
    }
    
    _removeHoverCircle() {
        const circle = this.elements.progress.querySelector('.progress-hover-circle');
        if (circle) {
            circle.remove();
        }
    }

    // Update repeat button state
    updateRepeatButton(isActive) {
        if (isActive) {
            this.elements.repeatButton.classList.add('active');
        } else {
            this.elements.repeatButton.classList.remove('active');
        }
    }
    
    // Update shuffle button state
    updateShuffleButton(isActive) {
        if (isActive) {
            this.elements.shuffleButton.classList.add('active');
        } else {
            this.elements.shuffleButton.classList.remove('active');
        }
    }
    
    // Update like button state
    updateLikeButton(isLiked) {
        if (isLiked) {
            this.elements.likeButton.classList.add('liked');
            this.elements.likeButton.querySelector('i').className = 'fas fa-heart';
        } else {
            this.elements.likeButton.classList.remove('liked');
            this.elements.likeButton.querySelector('i').className = 'far fa-heart';
        }
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

    showView(viewName) {
        // Hide all views
        this.elements.viewContainers.forEach(container => {
            container.classList.remove('active');
        });
        
        // Show the requested view
        const viewToShow = document.getElementById(`${viewName}-view`);
        if (viewToShow) {
            viewToShow.classList.add('active');
        }
    }

    showNotification(message, type = 'info') {
        // Check if notification container exists
        let notificationContainer = document.querySelector('.notification-container');
        
        if (!notificationContainer) {
            // Create notification container
            notificationContainer = document.createElement('div');
            notificationContainer.className = 'notification-container';
            document.body.appendChild(notificationContainer);
        }
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to container
        notificationContainer.appendChild(notification);
        
        // Remove after timeout
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

export default UIManager;