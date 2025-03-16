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
            volumeIcon: document.querySelector('.volume-control i'),
            repeatButton: document.getElementById('repeat') || document.getElementById('repeat-button'),
            likeButton: document.getElementById('like-current-song'),
            shuffleButton: document.getElementById('shuffle'),
            sidebarLinks: document.querySelectorAll('.sidebar-nav-item'),
            viewContainers: document.querySelectorAll('.view-container'),
            
            // Metadata panel elements
            metadataPanel: document.getElementById('metadata-panel'),
            metadataPanelClose: document.getElementById('metadata-panel-close'),
            metadataPanelImg: document.getElementById('metadata-panel-img'),
            metadataPanelTitle: document.getElementById('metadata-panel-title'),
            metadataPanelArtist: document.getElementById('metadata-panel-artist'),
            metadataPanelViews: document.getElementById('metadata-panel-views'),
            metadataPanelLikes: document.getElementById('metadata-panel-likes'),
            metadataPanelDuration: document.getElementById('metadata-panel-duration'),
            metadataPanelDescription: document.getElementById('metadata-panel-description'),
            metadataPanelDescriptionContainer: document.getElementById('metadata-panel-description-container'),
            metadataPanelTags: document.getElementById('metadata-panel-tags'),
            metadataPanelTagsContainer: document.getElementById('metadata-panel-tags-container')
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
        this.onAlbumArtClick = null;

        this.isDragging = false;
        this.pendingSeek = false;
        this.dragPosition = 0;
        this.lastProgressUpdate = 0; // Track last update time
        this.isMuted = false;
        this.lastVolume = 1.0; // Store last volume level before mute
        this.isVolumeDragging = false;
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
            
            // Handle volume dragging
            if (this.isVolumeDragging) {
                this.updateVolumeFromEvent(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                // Only seek on mouse release
                this.isDragging = false;
                this.executeDragSeek();
            }
            
            // Handle volume drag end
            if (this.isVolumeDragging) {
                this.isVolumeDragging = false;
            }
        });

        // Volume control click and drag handlers
        if (this.elements.volumeControl) {
            // Click handler
            this.elements.volumeControl.addEventListener('click', (e) => {
                if (this.onVolumeChange) {
                    const volumeWidth = this.elements.volumeControl.clientWidth;
                    const clickX = e.offsetX;
                    const volume = clickX / volumeWidth;
                    this.onVolumeChange(volume);
                    
                    // If we were muted, unmute when volume is changed
                    if (this.isMuted) {
                        this.toggleMute();
                    }
                }
            });
            
            // Mouse down for drag start
            this.elements.volumeControl.addEventListener('mousedown', (e) => {
                this.isVolumeDragging = true;
                this.updateVolumeFromEvent(e);
                
                // Prevent text selection during drag
                e.preventDefault();
            });
            
            // Touch start for mobile
            this.elements.volumeControl.addEventListener('touchstart', (e) => {
                this.isVolumeDragging = true;
                this.updateVolumeFromTouch(e);
                
                // Prevent scrolling during drag
                e.preventDefault();
            });
        }

        // Document event listeners for drag operations
        document.addEventListener('touchmove', (e) => {
            if (this.isVolumeDragging) {
                this.updateVolumeFromTouch(e);
                e.preventDefault();
            }
        });
        
        document.addEventListener('touchend', () => {
            this.isVolumeDragging = false;
        });

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

        // Album art click handler for metadata panel
        if (this.elements.currentThumbnail) {
            this.elements.currentThumbnail.addEventListener('click', () => {
                if (this.onAlbumArtClick) this.onAlbumArtClick();
            });
        }
        
        // Metadata panel close button
        if (this.elements.metadataPanelClose) {
            this.elements.metadataPanelClose.addEventListener('click', () => {
                this.hideMetadataPanel();
            });
        }
        
        // View More button for description
        const viewMoreBtn = document.getElementById('metadata-panel-view-more');
        if (viewMoreBtn) {
            viewMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent closing the panel
                this._toggleDescriptionExpansion();
            });
        }
        
        // Close metadata panel when clicking outside
        document.addEventListener('click', (e) => {
            if (this.elements.metadataPanel && 
                this.elements.metadataPanel.classList.contains('active') &&
                !this.elements.metadataPanel.contains(e.target) && 
                e.target !== this.elements.currentThumbnail) {
                this.hideMetadataPanel();
            }
        });

        // Volume icon click handler to toggle mute
        if (this.elements.volumeIcon) {
            this.elements.volumeIcon.addEventListener('click', () => {
                this.toggleMute();
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
        
        // Update volume icon if not explicitly muted
        if (!this.isMuted) {
            this.updateVolumeIcon(volume);
        }
    }

    updateCurrentSong(song) {
        const currentSongElement = document.getElementById('current-song');
        const currentArtistElement = document.getElementById('current-artist');
        const currentThumbnailElement = document.getElementById('current-thumbnail');
        
        if (currentSongElement) {
            currentSongElement.textContent = song.title || 'Unknown Title';
        }
        
        if (currentArtistElement) {
            currentArtistElement.textContent = song.artist || 'Unknown Artist';
        }
        
        if (currentThumbnailElement) {
            // Use direct thumbnail URL without cache-busting for better caching
            const thumbnailUrl = `/api/thumbnail/${song.id}`;
            // Set a data attribute for the original URL
            currentThumbnailElement.setAttribute('data-original-src', thumbnailUrl);
            // Set the src with error handling
            currentThumbnailElement.onerror = function() {
                this.onerror = null;
                this.src = '/static/images/placeholder.png';
                console.warn(`Failed to load thumbnail for song ${song.id}, using placeholder`);
            };
            currentThumbnailElement.src = thumbnailUrl;
        }
        document.title = `${song.title} - ${song.artist || 'Unknown Artist'}`;
    }

    createSongElement(song, isActive = false) {
        const songElement = document.createElement('div');
        songElement.className = 'song-card';
        songElement.dataset.songId = song.id;
        
        if (isActive) {
            songElement.classList.add('playing');
        }
        
        // Format thumbnail with lazy loading without cache-busting for better caching
        const thumbnailSrc = `/api/thumbnail/${song.id}`;
        const placeholderSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        
        songElement.innerHTML = `
            <img src="${placeholderSrc}" 
                 data-src="${thumbnailSrc}"
                 alt="${song.title}" 
                 loading="lazy"
                 onerror="this.onerror=null; this.src='/static/images/placeholder.png'">
            <h3>${song.title}</h3>
            <p>${song.artist || 'Unknown Artist'}</p>
            <div class="song-actions">
                <button class="like-button ${song.is_liked ? 'liked' : ''}" data-song-id="${song.id}">
                    <i class="${song.is_liked ? 'fas' : 'far'} fa-heart heart-icon"></i>
                </button>
            </div>
        `;
        
        // Add click handler for the like button
        const likeButton = songElement.querySelector('.like-button');
        if (likeButton) {
            likeButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent song click event
                
                if (window.playlistManager) {
                    // Toggle like state
                    window.playlistManager.toggleLike();
                } else {
                    console.error('PlaylistManager not available');
                }
            });
        }
        
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

    hideMetadataPanel() {
        this.elements.metadataPanel.classList.remove('active');
    }
    
    /**
     * Display the metadata panel with song information
     * @param {Object} metadata - The song metadata
     */
    showMetadataPanel(metadata) {
        if (!metadata || !metadata.song) {
            console.warn('Invalid metadata provided to showMetadataPanel');
            return;
        }
        
        const song = metadata.song;
        const tags = metadata.tags || [];
        
        // Update image
        if (this.elements.metadataPanelImg) {
            this.elements.metadataPanelImg.src = `/api/thumbnail/${song.id}`;
            this.elements.metadataPanelImg.alt = `${song.title} album art`;
        }
        
        // Update title and artist
        if (this.elements.metadataPanelTitle) {
            const songTitle = song.title || 'Unknown Title';
            this.elements.metadataPanelTitle.textContent = songTitle;
            // Add title attribute for tooltip on hover
            this.elements.metadataPanelTitle.setAttribute('title', songTitle);
        }
        
        if (this.elements.metadataPanelArtist) {
            const artistName = song.artist || 'Unknown Artist';
            this.elements.metadataPanelArtist.textContent = artistName;
            // Add title attribute for tooltip on hover
            this.elements.metadataPanelArtist.setAttribute('title', artistName);
        }
        
        // Update stats
        if (this.elements.metadataPanelViews) {
            this.elements.metadataPanelViews.textContent = this._formatNumber(song.view_count || 0);
        }
        
        if (this.elements.metadataPanelLikes) {
            this.elements.metadataPanelLikes.textContent = this._formatNumber(song.like_count || 0);
        }
        
        if (this.elements.metadataPanelDuration) {
            const durationSeconds = song.duration || 0;
            this.elements.metadataPanelDuration.textContent = this._formatDuration(durationSeconds);
        }
        
        // Update tags
        if (this.elements.metadataPanelTags && this.elements.metadataPanelTagsContainer) {
            this.elements.metadataPanelTags.innerHTML = '';
            
            if (tags.length > 0) {
                tags.forEach(tag => {
                    const tagElement = document.createElement('div');
                    tagElement.className = 'metadata-panel-tag';
                    tagElement.textContent = tag;
                    this.elements.metadataPanelTags.appendChild(tagElement);
                });
                
                this.elements.metadataPanelTagsContainer.style.display = 'block';
            } else {
                this.elements.metadataPanelTagsContainer.style.display = 'none';
            }
        }
        
        // Update description
        if (this.elements.metadataPanelDescription && this.elements.metadataPanelDescriptionContainer) {
            const viewMoreBtn = document.getElementById('metadata-panel-view-more');
            const fadeDivider = document.querySelector('.metadata-panel-description-fade');
            
            if (song.description) {
                // Format description: replace hashtags with styled spans
                const formattedDescription = song.description.replace(
                    /#(\w+)/g, 
                    '<span class="metadata-hashtag">#$1</span>'
                );
                
                // Reset the description element
                this.elements.metadataPanelDescription.innerHTML = formattedDescription;
                this.elements.metadataPanelDescription.classList.remove('expanded');
                
                // Reset fade and view more button
                if (fadeDivider) fadeDivider.classList.remove('hidden');
                if (viewMoreBtn) {
                    viewMoreBtn.textContent = 'View More';
                    viewMoreBtn.classList.remove('hidden');
                }
                
                // Check if the description needs a "View More" button
                const wordCount = song.description.split(/\s+/).length;
                if (wordCount <= 50) {
                    // Short description - hide the button and fade
                    if (viewMoreBtn) viewMoreBtn.classList.add('hidden');
                    if (fadeDivider) fadeDivider.classList.add('hidden');
                    
                    // Remove height restriction from description
                    this.elements.metadataPanelDescription.classList.add('expanded');
                }
                
                this.elements.metadataPanelDescriptionContainer.style.display = 'block';
            } else {
                this.elements.metadataPanelDescriptionContainer.style.display = 'none';
            }
        }
        
        // Show the panel
        this.elements.metadataPanel.classList.add('active');
    }
    
    /**
     * Format a number for display (e.g., 1000 -> 1K)
     * @param {number} num - The number to format
     * @returns {string} The formatted number
     */
    _formatNumber(num) {
        if (num < 1000) return num.toString();
        if (num < 1000000) return Math.floor(num / 1000) + 'K';
        return Math.floor(num / 1000000) + 'M';
    }
    
    /**
     * Format duration in seconds to MM:SS format
     * @param {number} seconds - The duration in seconds
     * @returns {string} The formatted duration
     */
    _formatDuration(seconds) {
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Toggle description expansion for the "View More" functionality
     * @private
     */
    _toggleDescriptionExpansion() {
        const descriptionEl = document.getElementById('metadata-panel-description');
        const viewMoreBtn = document.getElementById('metadata-panel-view-more');
        const fadeDivider = document.querySelector('.metadata-panel-description-fade');
        
        if (!descriptionEl || !viewMoreBtn) return;
        
        const isExpanded = descriptionEl.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            descriptionEl.classList.remove('expanded');
            viewMoreBtn.textContent = 'View More';
            if (fadeDivider) fadeDivider.classList.remove('hidden');
            
            // Scroll back to top of description
            descriptionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            // Expand
            descriptionEl.classList.add('expanded');
            viewMoreBtn.textContent = 'Show Less';
            if (fadeDivider) fadeDivider.classList.add('hidden');
        }
    }

    // Add methods for volume control
    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted) {
            // Store current volume and set to 0
            this.lastVolume = this.elements.volumeProgress.style.width ? 
                parseFloat(this.elements.volumeProgress.style.width) / 100 : 1.0;
            
            // Update icon to muted state
            this.elements.volumeIcon.className = 'fas fa-volume-mute';
            
            // Call the volume change handler with 0
            if (this.onVolumeChange) {
                this.onVolumeChange(0);
            }
        } else {
            // Restore previous volume
            const volumeToRestore = this.lastVolume || 0.5;
            
            // Update icon based on volume level
            this.updateVolumeIcon(volumeToRestore);
            
            // Call the volume change handler with restored volume
            if (this.onVolumeChange) {
                this.onVolumeChange(volumeToRestore);
            }
        }
    }

    updateVolumeFromEvent(e) {
        if (!this.elements.volumeControl || !this.onVolumeChange) return;
        
        const rect = this.elements.volumeControl.getBoundingClientRect();
        let volume = (e.clientX - rect.left) / rect.width;
        
        // Clamp volume between 0 and 1
        volume = Math.max(0, Math.min(1, volume));
        
        // Update volume
        this.onVolumeChange(volume);
        
        // If we were muted, unmute when volume is changed
        if (this.isMuted && volume > 0) {
            this.isMuted = false;
            this.updateVolumeIcon(volume);
        }
    }

    updateVolumeFromTouch(e) {
        if (!this.elements.volumeControl || !this.onVolumeChange) return;
        
        const rect = this.elements.volumeControl.getBoundingClientRect();
        const touch = e.touches[0];
        let volume = (touch.clientX - rect.left) / rect.width;
        
        // Clamp volume between 0 and 1
        volume = Math.max(0, Math.min(1, volume));
        
        // Update volume
        this.onVolumeChange(volume);
        
        // If we were muted, unmute when volume is changed
        if (this.isMuted && volume > 0) {
            this.isMuted = false;
            this.updateVolumeIcon(volume);
        }
    }

    updateVolumeIcon(volume) {
        if (!this.elements.volumeIcon) return;
        
        // Update the volume icon based on the volume level
        if (volume <= 0) {
            this.elements.volumeIcon.className = 'fas fa-volume-mute';
        } else if (volume < 0.5) {
            this.elements.volumeIcon.className = 'fas fa-volume-down';
        } else {
            this.elements.volumeIcon.className = 'fas fa-volume-up';
        }
    }
}

export default UIManager;