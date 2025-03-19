/**
 * PlaylistManager.js
 * Manages playlists, liked songs, and user collections
 */

import { isAuthenticated, getAuthToken } from './supabase/auth.js';

class PlaylistManager {
    constructor() {
        // Initialize properties
        this.likedSongs = [];
        this.containerUpdated = false;
        
        // Find the container element - use the correct ID from the HTML
        this.likedSongsContainer = document.getElementById('liked-songs-list');
        if (!this.likedSongsContainer) {
            console.warn('Liked songs list element not found, will retry when DOM is fully loaded');
            // Set up a mutation observer to find the container when it becomes available
            this._setupContainerObserver();
        } else {
            console.log('Liked songs container found on initialization');
        }
        
        // Initialize storage without clearing existing data
        this._initializeFromStorage();
        
        // Set up event listeners for liked view tab
        const likedTab = document.querySelector('a[data-view="liked"]');
        if (likedTab) {
            likedTab.addEventListener('click', () => this._handleLikedViewActivated());
        }
        
        // Set up authenticated events
        document.addEventListener('userAuthenticated', () => this.refreshAfterAuthChange(true));
        document.addEventListener('userLoggedOut', () => this.refreshAfterAuthChange(false));
        
        console.log('PlaylistManager initialized');
    }
    
    // Add this property to the class to track click processing
    isProcessingLikeClick = false;
    
    // Debounce implementation for like button
    _debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    _setupEventListeners() {
        // Open playlist modal
        if (this.createPlaylistBtn) {
            this.createPlaylistBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openPlaylistModal();
            });
        }
        
        // Close playlist modal
        if (this.closePlaylistModalBtn) {
            this.closePlaylistModalBtn.addEventListener('click', () => {
                this.closePlaylistModal();
            });
        }
        
        // Close add to playlist modal
        if (this.closeAddToPlaylistModalBtn) {
            this.closeAddToPlaylistModalBtn.addEventListener('click', () => {
                this.closeAddToPlaylistModal();
            });
        }
        
        // Handle outside click on modals
        window.addEventListener('click', (e) => {
            if (this.playlistModal && e.target === this.playlistModal) {
                this.closePlaylistModal();
            }
            if (this.addToPlaylistModal && e.target === this.addToPlaylistModal) {
                this.closeAddToPlaylistModal();
            }
        });
        
        // Create playlist form submission
        if (this.playlistForm) {
            this.playlistForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this._createNewPlaylist();
            });
        }
        
        // Like/unlike current song with debouncing
        if (this.likeButton) {
            // Remove any existing event listeners first
            const newLikeButton = this.likeButton.cloneNode(true);
            this.likeButton.parentNode.replaceChild(newLikeButton, this.likeButton);
            this.likeButton = newLikeButton;
            
            // Add new debounced event listener
            const debouncedToggleLike = this._debounce(() => {
                this.toggleLike();
            }, 250); // 250ms debounce
            
            this.likeButton.addEventListener('click', debouncedToggleLike);
        }
        
        // Navigation between views
        this.navLinks.forEach(link => {
            if (link) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = link.getAttribute('data-view');
                    this.showView(view);
                    
                    // Update active link
                    this.navLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                });
            }
        });
    }
    
    _loadFromStorage() {
        try {
            const storedSongs = localStorage.getItem('likedSongs');
            if (storedSongs) {
                const parsedSongs = JSON.parse(storedSongs);
                if (Array.isArray(parsedSongs)) {
                    this.likedSongs = parsedSongs;
                    console.log(`Loaded ${parsedSongs.length} liked songs from localStorage`);
                    // Update the UI to reflect the songs
                    this._renderLikedSongs();
                } else {
                    console.warn('Invalid liked songs data in localStorage (not an array)');
                }
            } else {
                console.log('No liked songs found in localStorage');
            }
        } catch (error) {
            console.error('Error loading liked songs from localStorage:', error);
        }
    }
    
    _saveToStorage() {
        try {
            if (Array.isArray(this.likedSongs)) {
                localStorage.setItem('likedSongs', JSON.stringify(this.likedSongs));
                console.log(`Saved ${this.likedSongs.length} liked songs to localStorage`);
            } else {
                console.warn('Cannot save liked songs: Not an array');
            }
        } catch (error) {
            console.error('Error saving liked songs to localStorage:', error);
        }
    }
    
    openPlaylistModal() {
        if (!this.playlistModal) return;
        
        console.log('Opening playlist modal');
        this.playlistModal.style.display = 'block';
        
        // Reset form
        if (this.playlistForm) {
            this.playlistForm.reset();
        }
    }
    
    closePlaylistModal() {
        if (!this.playlistModal) return;
        
        console.log('Closing playlist modal');
        this.playlistModal.style.display = 'none';
    }
    
    closeAddToPlaylistModal() {
        if (!this.addToPlaylistModal) return;
        
        console.log('Closing add to playlist modal');
        this.addToPlaylistModal.style.display = 'none';
    }
    
    showView(viewName) {
        console.log('Showing view:', viewName);
        
        // Hide all views
        this.viewContainers.forEach(container => {
            container.classList.remove('active');
        });
        
        // Show the requested view
        if (viewName === 'home') {
            const homeView = document.getElementById('home-view');
            if (homeView) {
                homeView.classList.add('active');
            }
        } else if (viewName === 'liked') {
            const likedView = document.getElementById('liked-view');
            if (likedView) {
                // Make sure we have the latest liked songs rendered
                this._renderLikedSongs();
                likedView.classList.add('active');
                console.log('Liked view activated with', this.likedSongs.length, 'songs');
                
                // Also ensure all liked songs are loaded into memory
                this._loadLikedSongsIntoMainMemory(this.likedSongs);
            } else {
                console.error('Liked view element not found');
            }
        } else if (viewName.startsWith('playlist-')) {
            // Show the specific playlist view
            const playlistId = viewName.replace('playlist-', '');
            const playlistView = document.getElementById(`playlist-view-${playlistId}`);
            if (playlistView) {
                // Get the playlist and refresh the view to ensure it's up to date
                const playlist = this.playlists.find(p => p.id === playlistId);
                if (playlist) {
                    this._updatePlaylistView(playlist);
                    
                    // Load playlist songs into memory
                    this._loadPlaylistSongsIntoMainMemory(playlist);
                }
                playlistView.classList.add('active');
            } else {
                console.error(`Playlist view not found for ID: ${playlistId}`);
            }
        }
        
        // Update active link in navigation
        this.navLinks.forEach(link => {
            const linkView = link.getAttribute('data-view');
            if (linkView === viewName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
    
    _createNewPlaylist() {
        const nameInput = document.getElementById('playlist-name');
        const descriptionInput = document.getElementById('playlist-description');
        
        if (!nameInput || !descriptionInput) {
            console.error('Playlist form inputs not found');
            this._showNotification('Error creating playlist: form inputs not found', 'error');
            return;
        }
        
        const name = nameInput.value.trim();
        const description = descriptionInput.value.trim();
        
        if (!name) {
            this._showNotification('Please enter a playlist name', 'error');
            return;
        }
        
        // Generate a unique ID
        const id = `playlist-${Date.now()}`;
        
        // Create the playlist object
        const playlist = {
            id,
            name,
            description: description || '',
            songs: [],
            createdAt: new Date().toISOString()
        };
        
        console.log('Creating new playlist:', playlist);
        
        // Add to playlists array
        this.playlists.push(playlist);
        
        // Save to localStorage
        this._saveToStorage();
        
        // Create playlist view
        const createdView = this._createPlaylistView(playlist);
        
        if (!createdView) {
            console.error('Failed to create playlist view');
            this._showNotification('Error creating playlist view', 'error');
        }
        
        // Add to sidebar
        this._renderPlaylists();
        
        // Close modal
        this.closePlaylistModal();
        
        // Show notification
        this._showNotification(`Playlist "${name}" created successfully!`, 'success');
        
        // Switch to the new playlist view
        setTimeout(() => {
            this.showView(`playlist-${id}`);
        }, 500);
    }
    
    _createPlaylistView(playlist) {
        // Check if template exists
        if (!this.playlistViewTemplate) {
            console.error('Playlist view template not found');
            return null;
        }
        
        // Check if the view already exists
        const existingView = document.getElementById(`playlist-view-${playlist.id}`);
        if (existingView) {
            return existingView;
        }
        
        try {
            // Clone the template
            const playlistView = this.playlistViewTemplate.content.cloneNode(true).firstElementChild;
            
            if (!playlistView) {
                console.error('Failed to clone playlist view template');
                return null;
            }
            
            // Set ID and other attributes
            playlistView.id = `playlist-view-${playlist.id}`;
            playlistView.setAttribute('data-playlist-id', playlist.id);
            
            // Find and update content
            const titleElement = playlistView.querySelector('.playlist-title');
            const descriptionElement = playlistView.querySelector('.description');
            const songCountElement = playlistView.querySelector('.song-count');
            
            if (titleElement) titleElement.textContent = playlist.name;
            if (descriptionElement) descriptionElement.textContent = playlist.description || 'No description';
            if (songCountElement) songCountElement.textContent = `${playlist.songs.length} songs`;
            
            // Add to main content container
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.appendChild(playlistView);
                
                // Set up songs list
                const songsList = playlistView.querySelector('.playlist-songs-list');
                if (songsList && playlist.songs.length > 0) {
                    this._renderPlaylistSongs(playlist, songsList);
                }
                
                return playlistView;
            } else {
                console.error('Main content container not found');
                return null;
            }
        } catch (error) {
            console.error('Error creating playlist view:', error);
            return null;
        }
    }
    
    _renderPlaylistSongs(playlist, container) {
        // Clear the container
        container.innerHTML = '';
        
        // Add each song
        playlist.songs.forEach((song, index) => {
            const row = document.createElement('tr');
            row.className = 'song-row';
            row.setAttribute('data-song-id', song.id);
            
            // Format duration
            const minutes = Math.floor(song.duration / 60);
            const seconds = Math.floor(song.duration % 60);
            const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Format song thumbnail URL without cache busting
            const thumbnailUrl = song.thumbnailUrl || `/api/thumbnail/${song.id}`;
            
            row.innerHTML = `
                <td class="song-number">${index + 1}</td>
                <td class="song-title">
                    <div class="song-info">
                        <div class="song-thumbnail">
                            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                                 data-src="${thumbnailUrl}" 
                                 alt="${song.title}"
                                 onerror="this.onerror=null; this.src='/static/images/placeholder.png';">
                        </div>
                        <div>
                            <div class="song-name">${song.title}</div>
                            <div class="song-artist">${song.artist || 'Unknown Artist'}</div>
                        </div>
                    </div>
                </td>
                <td class="song-album">${song.album || 'Unknown Album'}</td>
                <td class="song-duration">${formattedDuration}</td>
                <td class="song-actions">
                    <button class="remove-from-playlist-btn" title="Remove from Playlist">
                        <i class="fas fa-minus"></i>
                    </button>
                </td>
            `;
            
            // Add click event to play the song
            row.addEventListener('click', (e) => {
                // Ignore clicks on action buttons
                if (e.target.closest('.song-actions')) {
                    return;
                }
                
                // Play the song
                this._playSong(song);
            });
            
            // Add remove button event
            const removeBtn = row.querySelector('.remove-from-playlist-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeSongFromPlaylist(song.id, playlist.id);
                });
            }
            
            // Add "add to playlist" button handler
            const addToPlaylistButton = row.querySelector('.add-to-playlist-button');
            if (addToPlaylistButton) {
                addToPlaylistButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent row click
                    this._showAddToPlaylistModal(song);
                });
            }
            
            container.appendChild(row);
        });
    }
    
    _renderPlaylists() {
        // Check if container exists
        if (!this.playlistContainer) {
            console.error('Playlists container not found');
            return;
        }
        
        // Clear the container
        this.playlistContainer.innerHTML = '';
        
        // Check if we have any playlists
        if (this.playlists.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-playlists-message';
            emptyMessage.textContent = 'No playlists yet';
            this.playlistContainer.appendChild(emptyMessage);
            return;
        }
        
        // Sort playlists by creation time (newest first)
        const sortedPlaylists = [...this.playlists].sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        console.log('Rendering playlists:', sortedPlaylists.length);
        
        // Add each playlist to the sidebar
        sortedPlaylists.forEach(playlist => {
            const playlistItem = document.createElement('div');
            playlistItem.className = 'playlist-item';
            playlistItem.setAttribute('data-playlist-id', playlist.id);
            
            playlistItem.innerHTML = `
                <div class="playlist-icon">
                    <i class="fas fa-music"></i>
                </div>
                <div class="playlist-name">${playlist.name}</div>
            `;
            
            // Add click event
            playlistItem.addEventListener('click', () => {
                this.showView(`playlist-${playlist.id}`);
                
                // Update active state in sidebar
                document.querySelectorAll('.playlist-item').forEach(item => {
                    item.classList.remove('active');
                });
                playlistItem.classList.add('active');
                
                // Update nav links active state
                if (this.navLinks) {
                    this.navLinks.forEach(link => {
                        link.classList.remove('active');
                    });
                }
            });
            
            this.playlistContainer.appendChild(playlistItem);
            
            // Create the view if it doesn't exist
            if (!document.getElementById(`playlist-view-${playlist.id}`)) {
                this._createPlaylistView(playlist);
            }
        });
    }
    
    /**
     * Render the liked songs in the UI
     * @private
     */
    _renderLikedSongs() {
        console.log('Rendering liked songs...');
        
        // Get the container element
        const container = document.getElementById('liked-songs-list');
        if (!container) {
            console.error('Liked songs container not found');
            return;
        }
        
        // Clear existing content
        container.innerHTML = '';
        
        // Update the count display
        const countElement = document.getElementById('liked-songs-count');
        if (countElement) {
            countElement.textContent = `${this.likedSongs.length} songs`;
        }
        
        // Log current state for debugging
        console.log(`Rendering ${this.likedSongs.length} liked songs`);
        if (this.likedSongs.length > 0) {
            console.log('First few song IDs:', this.likedSongs.slice(0, 3).map(s => s.id));
        }
        
        // If no songs, show empty state
        if (!this.likedSongs || this.likedSongs.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-state';
            emptyRow.innerHTML = `
                <td colspan="5" class="empty-state-message">
                    <i class="fas fa-heart"></i>
                    <p>No liked songs yet</p>
                </td>
            `;
            container.appendChild(emptyRow);
            return;
        }
        
        // Add each song to the table
        this.likedSongs.forEach((song, index) => {
            if (!song || !song.id) {
                console.warn('Invalid song object:', song);
                return;
            }
            
            const row = document.createElement('tr');
            row.className = 'song-row';
            row.setAttribute('data-song-id', song.id);
            
            // Make the entire row clickable
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => this._playSong(song));
            
            // Add song number
            const numberCell = document.createElement('td');
            numberCell.className = 'song-number';
            numberCell.textContent = index + 1;
            row.appendChild(numberCell);
            
            // Add title with thumbnail (combined)
            const titleCell = document.createElement('td');
            titleCell.className = 'song-title';
            
            // Create a container for thumbnail and text
            const songInfo = document.createElement('div');
            songInfo.className = 'song-info';
            
            // Add thumbnail
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.className = 'song-thumbnail';
            const thumbnail = document.createElement('img');
            thumbnail.src = song.thumbnailUrl || '/static/images/placeholder.png';
            thumbnail.alt = `${song.title} by ${song.artist}`;
            thumbnail.onerror = function() {
                this.src = '/static/images/placeholder.png';
            };
            thumbnailContainer.appendChild(thumbnail);
            songInfo.appendChild(thumbnailContainer);
            
            // Add title and artist text
            const textContainer = document.createElement('div');
            textContainer.className = 'song-text';
            
            const titleText = document.createElement('div');
            titleText.className = 'song-name';
            titleText.textContent = song.title || 'Unknown Title';
            
            const artistText = document.createElement('div');
            artistText.className = 'song-artist';
            artistText.textContent = song.artist || 'Unknown Artist';
            
            textContainer.appendChild(titleText);
            textContainer.appendChild(artistText);
            songInfo.appendChild(textContainer);
            
            titleCell.appendChild(songInfo);
            row.appendChild(titleCell);
            
            // Add album
            const albumCell = document.createElement('td');
            albumCell.className = 'song-album';
            albumCell.textContent = song.album || 'Unknown Album';
            row.appendChild(albumCell);
            
            // Add duration
            const durationCell = document.createElement('td');
            durationCell.className = 'song-duration';
            durationCell.textContent = this._formatDuration(song.duration);
            row.appendChild(durationCell);
            
            // Add actions cell
            const actionsCell = document.createElement('td');
            actionsCell.className = 'song-actions';
            
            // Add play button
            const playButton = document.createElement('button');
            playButton.className = 'play-button';
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.title = 'Play Song';
            playButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent row click
                this._playSong(song);
            });
            
            // Add remove button
            const removeButton = document.createElement('button');
            removeButton.className = 'remove-button';
            removeButton.innerHTML = '<i class="fas fa-times"></i>';
            removeButton.title = 'Remove from Liked Songs';
            removeButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent row click
                this._toggleLike(song.id);
            });
            
            actionsCell.appendChild(playButton);
            actionsCell.appendChild(removeButton);
            row.appendChild(actionsCell);
            
            // Add the row to the container
            container.appendChild(row);
            
            // Set up lazy loading for the thumbnail
            this._setupLazyLoading(thumbnail);
        });
        
        // Log final state
        console.log(`Rendered ${container.children.length} song rows in liked songs table`);
    }
    
    _setupLazyLoading() {
        // Use a shared IntersectionObserver instance for better performance
        if (!window.lazyImageObserver) {
            // Create a single global observer
            window.lazyImageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const dataSrc = img.getAttribute('data-src');
                        
                        if (dataSrc) {
                            // Set a loading flag to prevent duplicate loads
                            if (img.dataset.loading === 'true') return;
                            img.dataset.loading = 'true';
                            
                            // Use the image cache if possible
                            if (window.app && window.app.imageCache && window.app.imageCache[dataSrc]) {
                                img.src = window.app.imageCache[dataSrc];
                            } else {
                                img.src = dataSrc;
                            }
                            
                            // Clean up after loading
                            img.onload = () => {
                                img.removeAttribute('data-src');
                                img.removeAttribute('data-loading');
                                observer.unobserve(img);
                            };
                            
                            img.onerror = () => {
                                img.src = '/static/images/placeholder.png';
                                img.removeAttribute('data-src');
                                img.removeAttribute('data-loading');
                                observer.unobserve(img);
                            };
                        }
                    }
                });
            }, {
                // Options for better performance
                rootMargin: '200px 0px', // Load images when they're within 200px of the viewport
                threshold: 0.1 // Start loading when 10% of the image is visible
            });
        }
        
        // Only observe images that aren't already being observed
        document.querySelectorAll('img[data-src]:not([data-observed])').forEach(img => {
            img.setAttribute('data-observed', 'true');
            window.lazyImageObserver.observe(img);
        });
    }
    
    /**
     * Format duration in seconds to MM:SS format
     * @param {number} seconds - Duration in seconds
     * @returns {string} - Formatted duration
     */
    _formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '--:--';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    _playSong(song) {
        // This would trigger the main player to play this song
        console.log('PlaylistManager requesting to play song:', song);
        
        // Add basic validation to prevent errors
        if (!song || !song.id) {
            console.error('Cannot play song: Invalid song object', song);
            this._showNotification('Cannot play song: Invalid song data', 'error');
            return;
        }
        
        const attemptPlay = (retries = 3) => {
            // Check if the main player is available
            if (window.musicPlayer) {
                // Find the song in the main player's song list
                const mainPlayerSong = window.musicPlayer.songListManager?.songs?.find(s => 
                    s.id === song.id || s.title === song.title
                );
                
                if (mainPlayerSong) {
                    // If found in main player, play that version (which might have more data)
                    console.log('Found song in main player, playing from there:', mainPlayerSong.id);
                    window.musicPlayer.playSong(mainPlayerSong);
                } else {
                    // If not found in main player, ensure the song has necessary fields and play directly
                    const playableSong = {
                        ...song,
                        // Ensure thumbnail URL is set to a placeholder if missing
                        thumbnailUrl: song.thumbnailUrl || `/static/images/placeholder.png`
                    };
                    console.log('Song not found in main player, playing directly:', playableSong.id);
                    window.musicPlayer.playSong(playableSong);
                }
            } else if (retries > 0) {
                console.warn(`Main music player not available, retrying in 500ms (${retries} retries left)`);
                setTimeout(() => attemptPlay(retries - 1), 500);
            } else {
                console.error('Main music player not available for playing song');
                // Show a notification
                this._showNotification('Cannot play song: player not initialized', 'error');
            }
        };
        
        attemptPlay();
        
        // Update the like button state
        this._updateLikeButtonState(song.id);
    }
    
    /**
     * Update the like button state for a song
     * @param {string} songId - The song ID to check
     * @returns {boolean} Whether the song is liked
     */
    _updateLikeButtonState(songId) {
        console.log('Updating like button state for song ID:', songId);
        
        if (!songId) {
            console.warn('Cannot update like button: No song ID provided');
            return false;
        }
        
        // Check if the song is in the liked songs array
        const isLiked = this.likedSongs.some(song => song && song.id === songId);
        
        console.log(`Song ${songId} like status:`, isLiked);
        
        // Update the UI
        this._updateLikeButtonUI(isLiked);
        
        // Update any song rows in the lists
        this._updateSongLikeStateInLists(songId, isLiked);
        
        return isLiked;
    }
    
    /**
     * Update the like button UI to reflect the current like state
     * @param {boolean} isLiked - Whether the song is liked
     */
    _updateLikeButtonUI(isLiked) {
        console.log('Updating like button UI, isLiked:', isLiked);
        
        // Get the like button from the document
        const likeButton = document.getElementById('like-current-song');
        if (!likeButton) {
            console.warn('Like button element not found');
            return;
        }
        
        // Update button appearance based on like state
        if (isLiked) {
            likeButton.classList.add('liked');
            
            // Update icon to solid heart if it exists
            const icon = likeButton.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-heart'; // Solid heart icon
            }
        } else {
            likeButton.classList.remove('liked');
            
            // Update icon to regular heart if it exists
            const icon = likeButton.querySelector('i');
            if (icon) {
                icon.className = 'far fa-heart'; // Regular heart icon
            }
        }
    }
    
    /**
     * Toggle the like status of the current song
     */
    toggleLike() {
        // Get current song info
        const currentSongElement = document.getElementById('current-song');
        const currentArtistElement = document.getElementById('current-artist');
        const currentThumbnail = document.getElementById('current-thumbnail');
        
        if (!currentSongElement || !currentThumbnail || 
            currentSongElement.textContent === 'No track selected') {
            console.warn('No song is currently playing, cannot toggle like status');
            this._showNotification('No song is currently playing', 'warning');
            return;
        }
        
        // Prevent rapid clicking and race conditions
        if (this.isProcessingLikeClick) {
            console.log('Already processing a like click, ignoring');
            return;
        }
        
        this.isProcessingLikeClick = true;
        
        try {
            // Get current song details
            const songTitle = currentSongElement.textContent;
            const artistName = currentArtistElement.textContent;
            const songId = this._extractSongId(currentThumbnail.src);
            
            console.log(`Toggling like status for song: ID=${songId}, Title="${songTitle}", Artist="${artistName}"`);
            
            if (!songId) {
                console.error('Could not extract song ID from thumbnail');
                this._showNotification('Error: Could not identify song', 'error');
                this.isProcessingLikeClick = false;
                return;
            }
            
            // Find the song in liked songs
            const songIndex = this._findSongIndex(songId, songTitle, artistName);
            
            // Create a song object for consistent handling
            const songObject = {
                id: songId,
                title: songTitle,
                artist: artistName,
                album: currentArtistElement.getAttribute('data-album') || 'Unknown Album',
                thumbnailUrl: currentThumbnail.src
            };
            
            // Track the initial state for comparison
            const isInitiallyLiked = songIndex !== -1;
            
            // Update local state immediately for better UI responsiveness
            if (isInitiallyLiked) {
                // Immediately update local state for better responsiveness
                this.likedSongs.splice(songIndex, 1);
                this._updateLikeButtonUI(false);
                this._updateSongLikeStateInLists(songId, false);
                
                console.log(`Unliking song: ${songTitle} (ID: ${songId})`);
            } else {
                // Immediately update local state for better responsiveness
                this.likedSongs.push(songObject);
                this._updateLikeButtonUI(true);
                this._updateSongLikeStateInLists(songId, true);
                
                console.log(`Liking song: ${songTitle} (ID: ${songId})`);
            }
            
            // Update database in the background (if authenticated)
            const isAuthenticated = typeof window.isAuthenticated === 'function' && window.isAuthenticated();
            if (isAuthenticated) {
                console.log(`Updating database for song ${songId} - ${isInitiallyLiked ? 'unlike' : 'like'} operation`);
                
                // Start a timeout to detect slow operations
                const timeoutId = setTimeout(() => {
                    this._showNotification('Server update in progress...', 'info');
                }, 500);
                
                // Perform the database operation
                const dbPromise = isInitiallyLiked 
                    ? this._unlikeSongInDatabase(songId)
                    : this._likeSongInDatabase(songId);
                    
                dbPromise
                    .then(success => {
                        clearTimeout(timeoutId);
                        
                        if (success) {
                            // Database update succeeded
                            console.log(`Database updated successfully for song ${songId}`);
                            this._showNotification(
                                isInitiallyLiked 
                                    ? `Removed "${songTitle}" from Liked Songs` 
                                    : `Added "${songTitle}" to Liked Songs`, 
                                isInitiallyLiked ? 'info' : 'success'
                            );
                            
                            // Save to storage and update UI after database is synced
                            this._saveToStorage();
                            this._renderLikedSongs();
                            
                            // Update all song UI elements
                            this._updateAllSongLikeStates();
                        } else {
                            // Database update failed - revert local state
                            console.error(`Database update failed for song ${songId}`);
                            this._showNotification('Failed to update server. Try again.', 'error');
                            
                            // Revert local state to match server
                            if (isInitiallyLiked) {
                                this.likedSongs.push(songObject);
                                this._updateLikeButtonUI(true);
                                this._updateSongLikeStateInLists(songId, true);
                            } else {
                                const revertIndex = this._findSongIndex(songId, songTitle, artistName);
                                if (revertIndex !== -1) {
                                    this.likedSongs.splice(revertIndex, 1);
                                }
                                this._updateLikeButtonUI(false);
                                this._updateSongLikeStateInLists(songId, false);
                            }
                            
                            // Update UI after revert
                            this._saveToStorage();
                            this._renderLikedSongs();
                        }
                    })
                    .catch(error => {
                        clearTimeout(timeoutId);
                        console.error(`Error ${isInitiallyLiked ? 'unliking' : 'liking'} song in database:`, error);
                        this._showNotification('Error updating server. Try again.', 'error');
                        
                        // Revert local state to match server
                        if (isInitiallyLiked) {
                            this.likedSongs.push(songObject);
                            this._updateLikeButtonUI(true);
                            this._updateSongLikeStateInLists(songId, true);
                        } else {
                            const revertIndex = this._findSongIndex(songId, songTitle, artistName);
                            if (revertIndex !== -1) {
                                this.likedSongs.splice(revertIndex, 1);
                            }
                            this._updateLikeButtonUI(false);
                            this._updateSongLikeStateInLists(songId, false);
                        }
                        
                        // Update UI after revert
                        this._saveToStorage();
                        this._renderLikedSongs();
                    })
                    .finally(() => {
                        // Allow future like/unlike operations
                        setTimeout(() => {
                            this.isProcessingLikeClick = false;
                        }, 300); // Small delay to prevent accidental double-clicks
                    });
            } else {
                // For non-authenticated users, just update local storage
                this._saveToStorage();
                this._renderLikedSongs();
                
                this._showNotification(
                    isInitiallyLiked 
                        ? `Removed "${songTitle}" from Liked Songs` 
                        : `Added "${songTitle}" to Liked Songs`, 
                    isInitiallyLiked ? 'info' : 'success'
                );
                
                // Allow future like/unlike operations after a small delay
                setTimeout(() => {
                    this.isProcessingLikeClick = false;
                }, 300);
            }
        } catch (error) {
            console.error('Error in toggleLike:', error);
            this._showNotification('Error updating like status', 'error');
            this.isProcessingLikeClick = false;
        }
    }
    
    /**
     * Like a song in the database
     * @param {string} songId - The ID of the song to like
     * @returns {Promise<boolean>} - Promise that resolves to true if operation was successful
     * @private
     */
    async _likeSongInDatabase(songId) {
        const MAX_RETRIES = 2;
        let retryCount = 0;
        
        while (retryCount <= MAX_RETRIES) {
            try {
                console.log(`Adding song ID "${songId}" to liked songs in database (attempt ${retryCount + 1})`);
                
                if (!songId) {
                    console.error('Cannot like song: No song ID provided');
                    return false;
                }
                
                // Get auth token
                const token = this._getAuthToken();
                if (!token) {
                    console.error('Cannot like song: No authentication token');
                    return false;
                }
                
                // Make API call to like song with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
                
                const response = await fetch('/api/like-song', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ songId: songId }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const data = await response.json().catch(() => ({ error: 'Invalid JSON response' }));
                    console.error('Error liking song in database:', data.error || response.statusText);
                    
                    // Handle specific error cases
                    if (response.status === 401) {
                        console.error('Authentication error - token may be invalid');
                        return false; // Auth errors shouldn't retry
                    }
                    
                    // For 5xx server errors, retry
                    if (response.status >= 500 && retryCount < MAX_RETRIES) {
                        console.log(`Server error, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
                        continue;
                    }
                    
                    return false;
                }
                
                const data = await response.json().catch(() => ({ success: true }));
                console.log('Successfully liked song in database:', data.message || 'Success');
                return true;
            } catch (error) {
                console.error('Exception in _likeSongInDatabase:', error);
                
                // Handle abort/timeout
                if (error.name === 'AbortError') {
                    console.error('Database request timed out');
                    
                    if (retryCount < MAX_RETRIES) {
                        console.log(`Request timed out, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
                        continue;
                    }
                }
                
                return false;
            }
        }
        
        return false; // If we exhausted retries
    }
    
    /**
     * Unlike a song in the database
     * @param {string} songId - The ID of the song to unlike
     * @returns {Promise<boolean>} - Promise that resolves to true if operation was successful
     * @private
     */
    async _unlikeSongInDatabase(songId) {
        const MAX_RETRIES = 2;
        let retryCount = 0;
        
        while (retryCount <= MAX_RETRIES) {
            try {
                console.log(`Removing song ID "${songId}" from liked songs in database (attempt ${retryCount + 1})`);
                
                if (!songId) {
                    console.error('Cannot unlike song: No song ID provided');
                    return false;
                }
                
                // Get auth token
                const token = this._getAuthToken();
                if (!token) {
                    console.error('Cannot unlike song: No authentication token');
                    return false;
                }
                
                // Make API call to unlike song with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
                
                const response = await fetch('/api/unlike-song', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ songId: songId }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const data = await response.json().catch(() => ({ error: 'Invalid JSON response' }));
                    console.error('Error unliking song in database:', data.error || response.statusText);
                    
                    // Handle specific error cases
                    if (response.status === 401) {
                        console.error('Authentication error - token may be invalid');
                        return false; // Auth errors shouldn't retry
                    }
                    
                    // For 5xx server errors, retry
                    if (response.status >= 500 && retryCount < MAX_RETRIES) {
                        console.log(`Server error, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
                        continue;
                    }
                    
                    return false;
                }
                
                const data = await response.json().catch(() => ({ success: true }));
                console.log('Successfully unliked song in database:', data.message || 'Success');
                return true;
            } catch (error) {
                console.error('Exception in _unlikeSongInDatabase:', error);
                
                // Handle abort/timeout
                if (error.name === 'AbortError') {
                    console.error('Database request timed out');
                    
                    if (retryCount < MAX_RETRIES) {
                        console.log(`Request timed out, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
                        continue;
                    }
                }
                
                return false;
            }
        }
        
        return false; // If we exhausted retries
    }
    
    // Helper method to extract song ID from various formats
    _extractSongId(src) {
        if (!src) return null;
        
        console.log('Extracting song ID from src:', src);
        
        // Try the new API thumbnail format: /api/thumbnail/{songId}
        const apiThumbnailMatch = src.match(/\/api\/thumbnail\/([^/?#]+)/);
        if (apiThumbnailMatch && apiThumbnailMatch[1]) {
            console.log('Extracted ID from API thumbnail:', apiThumbnailMatch[1]);
            return apiThumbnailMatch[1];
        }
        
        // Try B2 storage URL format: https://spotifyclonemp3.s3.eu-central-003.backblazeb2.com/thumbnails/{songId}.png
        const b2Match = src.match(/\/thumbnails\/([^.]+)\.png/);
        if (b2Match && b2Match[1]) {
            console.log('Extracted ID from B2 storage URL:', b2Match[1]);
            return b2Match[1];
        }
        
        // Try static audio format
        const staticMatch = src.match(/\/static\/audio\/([^.]+)/);
        if (staticMatch && staticMatch[1]) {
            console.log('Extracted ID from static audio:', staticMatch[1]);
            return staticMatch[1];
        }
        
        // Try direct number format
        const numberMatch = src.match(/\/(\d+)\.(jpg|png)$/);
        if (numberMatch && numberMatch[1]) {
            console.log('Extracted ID from number format:', numberMatch[1]);
            return numberMatch[1];
        }
        
        // Try to extract just a numeric ID if it exists in the URL
        const numericIdMatch = src.match(/(\d+)/);
        if (numericIdMatch && numericIdMatch[1]) {
            console.log('Extracted numeric ID:', numericIdMatch[1]);
            return numericIdMatch[1];
        }
        
        // Last resort - use the full URL hash
        if (src) {
            const hash = src.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            console.log('Generated hash ID:', Math.abs(hash).toString());
            return Math.abs(hash).toString();
        }
        
        return null;
    }
    
    // Add a new helper method to update song like state in all song lists
    _updateSongLikeStateInLists(songId, isLiked) {
        // Update heart icons in all song lists for this song
        document.querySelectorAll('.song-row, .song-card').forEach(row => {
            // Check if this row represents the toggled song
            const rowSongId = row.getAttribute('data-song-id');
            if (rowSongId === songId) {
                // Update heart icon
                const heartIcon = row.querySelector('.heart-icon, .fa-heart');
                if (heartIcon) {
                    if (isLiked) {
                        heartIcon.className = heartIcon.className.replace('far', 'fas');
                        heartIcon.closest('button')?.classList.add('liked');
                    } else {
                        heartIcon.className = heartIcon.className.replace('fas', 'far');
                        heartIcon.closest('button')?.classList.remove('liked');
                    }
                }
            }
        });
    }
    
    /**
     * Find the index of a song in the liked songs array
     * @param {string} songId - Song ID to search for
     * @param {string} songTitle - Song title to use as fallback
     * @param {string} artistName - Artist name to use as fallback
     * @returns {number} - Index of the song or -1 if not found
     */
    _findSongIndex(songId, songTitle, artistName) {
        if (!this.likedSongs || !this.likedSongs.length) {
            console.log('No liked songs to search in');
            return -1;
        }
        
        // Try to match by ID first
        if (songId) {
            const indexById = this.likedSongs.findIndex(song => song && song.id === songId);
            if (indexById >= 0) {
                console.log(`Found song by ID at index ${indexById}`);
                return indexById;
            }
            
            // If the ID is not a numeric ID, try comparing with the title-artist based IDs
            if (isNaN(Number(songId)) && songId.includes('-')) {
                for (let i = 0; i < this.likedSongs.length; i++) {
                    const song = this.likedSongs[i];
                    if (!song) continue;
                    
                    // Generate a title-artist ID for the song and compare
                    const generatedId = `${song.title}-${song.artist}`.replace(/[^\w]/g, '-').toLowerCase();
                    if (generatedId === songId) {
                        console.log(`Found song by generated ID at index ${i}`);
                        return i;
                    }
                }
            }
        }
        
        // Try to match by title and artist
        if (songTitle && artistName) {
            const indexByTitleArtist = this.likedSongs.findIndex(song => 
                song && song.title === songTitle && song.artist === artistName
            );
            
            if (indexByTitleArtist >= 0) {
                console.log(`Found song by title/artist at index ${indexByTitleArtist}`);
                return indexByTitleArtist;
            }
        }
        
        // Try to match by title only as a last resort
        if (songTitle) {
            const indexByTitle = this.likedSongs.findIndex(song => 
                song && song.title === songTitle
            );
            
            if (indexByTitle >= 0) {
                console.log(`Found song by title at index ${indexByTitle}`);
                return indexByTitle;
            }
        }
        
        console.log('Song not found in liked songs array');
        return -1;
    }
    
    unlikeSong(songId) {
        // Find the song
        const songIndex = this.likedSongs.findIndex(song => song.id === songId);
        
        if (songIndex !== -1) {
            const song = this.likedSongs[songIndex];
            
            // Remove the song
            this.likedSongs.splice(songIndex, 1);
            
            // Save to localStorage
            this._saveToStorage();
            
            // Update UI
            this._renderLikedSongs();
            
            // Update like button if this is the current song
            const currentThumbnail = document.getElementById('current-thumbnail');
            if (currentThumbnail) {
                const currentSongId = this._extractSongId(currentThumbnail.src);
                
                // Check if the unliked song is currently playing
                if (currentSongId === songId || this._findSongIndex(songId, song.title, song.artist) !== -1) {
                    if (this.likeButton) {
                        this._updateLikeButtonUI(false);
                    }
                }
            }
            
            // Update song in all lists
            this._updateSongLikeStateInLists(songId, false);
            
            this._showNotification(`Removed "${song.title}" from Liked Songs`, 'info');
        }
    }
    
    addSongToPlaylist(songId, playlistId) {
        // Find the playlist
        const playlist = this.playlists.find(p => p.id === playlistId);
        
        if (!playlist) {
            this._showNotification('Playlist not found', 'error');
            return;
        }
        
        // Find the song (either in liked songs or get it from the current player)
        let song = this.likedSongs.find(s => s.id === songId);
        
        if (!song) {
            // Song might not be in liked songs, get from player
            const currentSongElement = document.getElementById('current-song');
            const currentArtistElement = document.getElementById('current-artist');
            const currentThumbnail = document.getElementById('current-thumbnail');
            
            if (!currentSongElement || currentSongElement.textContent === 'No track selected') {
                this._showNotification('No song selected', 'error');
                return;
            }
            
            // Create song object
            song = {
                id: songId,
                title: currentSongElement.textContent,
                artist: currentArtistElement ? currentArtistElement.textContent : 'Unknown Artist',
                album: 'Unknown Album',
                duration: 0,
                thumbnailUrl: currentThumbnail ? currentThumbnail.src : ''
            };
        }
        
        // Check if song is already in playlist
        if (playlist.songs.some(s => s.id === songId)) {
            this._showNotification(`"${song.title}" is already in playlist "${playlist.name}"`, 'info');
            return;
        }
        
        console.log(`Adding song ${song.title} to playlist ${playlist.name}`);
        
        // Add the song to the playlist
        playlist.songs.push(song);
        
        // Save to localStorage
        this._saveToStorage();
        
        // Update the playlist view
        this._updatePlaylistView(playlist);
        
        this._showNotification(`Added "${song.title}" to playlist "${playlist.name}"`, 'success');
    }
    
    _updatePlaylistView(playlist) {
        // Get the playlist view
        const playlistView = document.getElementById(`playlist-view-${playlist.id}`);
        
        if (!playlistView) {
            console.error(`Playlist view not found for playlist: ${playlist.id}`);
            return;
        }
        
        try {
            // Update song count
            const songCountElement = playlistView.querySelector('.song-count');
            if (songCountElement) {
                songCountElement.textContent = `${playlist.songs.length} songs`;
            }
            
            // Update songs list
            const songsList = playlistView.querySelector('.playlist-songs-list');
            if (songsList) {
                this._renderPlaylistSongs(playlist, songsList);
            } else {
                console.error('Songs list container not found in playlist view');
            }
        } catch (error) {
            console.error('Error updating playlist view:', error);
        }
    }
    
    removeSongFromPlaylist(songId, playlistId) {
        // Find the playlist
        const playlist = this.playlists.find(p => p.id === playlistId);
        
        if (!playlist) return;
        
        // Find the song
        const songIndex = playlist.songs.findIndex(s => s.id === songId);
        
        if (songIndex !== -1) {
            const song = playlist.songs[songIndex];
            
            // Remove the song
            playlist.songs.splice(songIndex, 1);
            
            // Save to localStorage
            this._saveToStorage();
            
            // Update the playlist view
            this._updatePlaylistView(playlist);
            
            this._showNotification(`Removed "${song.title}" from playlist "${playlist.name}"`, 'info');
        }
    }
    
    _showNotification(message, type = 'info') {
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
    
    _showAddToPlaylistModal(song) {
        // Get the modal
        if (!this.addToPlaylistModal) {
            console.error('Add to playlist modal not found');
            return;
        }
        
        const playlistsList = this.addToPlaylistModal.querySelector('.playlists-list');
        if (!playlistsList) {
            console.error('Playlists list container not found in modal');
            return;
        }
        
        console.log('Opening add to playlist modal for song:', song.title);
        
        // Clear the list
        playlistsList.innerHTML = '';
        
        // If no playlists exist, show a message
        if (this.playlists.length === 0) {
            const message = document.createElement('p');
            message.className = 'no-playlists-message';
            message.textContent = 'You have no playlists yet. Create a playlist first.';
            playlistsList.appendChild(message);
        } else {
            // Add each playlist to the list
            this.playlists.forEach(playlist => {
                const playlistItem = document.createElement('div');
                playlistItem.className = 'playlist-choice';
                
                playlistItem.innerHTML = `
                    <div class="playlist-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="playlist-info">
                        <div class="playlist-name">${playlist.name}</div>
                        <div class="song-count">${playlist.songs.length} songs</div>
                    </div>
                `;
                
                // Add click event to add the song to this playlist
                playlistItem.addEventListener('click', () => {
                    this.addSongToPlaylist(song.id, playlist.id);
                    // Close modal
                    this.closeAddToPlaylistModal();
                });
                
                playlistsList.appendChild(playlistItem);
            });
        }
        
        // Show the modal
        this.addToPlaylistModal.style.display = 'block';
    }

    /**
     * Set the initial like state for a song
     * @param {string} songId - The ID of the song
     * @param {string} songTitle - The title of the song
     * @param {string} artistName - The artist of the song
     */
    setInitialLikeState(songId, songTitle, artistName) {
        try {
            console.log(`Setting initial like state for song: ${songId} - ${songTitle}`);
            
            if (!songId) {
                console.warn('Cannot set like state: Missing song ID');
                return;
            }
            
            // Check if this song is in our liked songs array by ID
            const isLiked = this.likedSongs.some(likedSong => {
                // First try direct ID match (most reliable)
                if (likedSong.id && songId && likedSong.id.toString() === songId.toString()) {
                    return true;
                }
                
                // If ID match failed but we have title/artist, try matching those
                if (songTitle && artistName && likedSong.title && likedSong.artist) {
                    const titleMatch = likedSong.title.toLowerCase() === songTitle.toLowerCase();
                    const artistMatch = likedSong.artist.toLowerCase() === artistName.toLowerCase();
                    return titleMatch && artistMatch;
                }
                
                return false;
            });
            
            console.log(`Like state for song ${songId}: ${isLiked ? 'Liked' : 'Not liked'}`);
            
            // Update UI to reflect the state
            this._updateLikeButtonUI(isLiked);
        } catch (error) {
            console.error('Error in setInitialLikeState:', error);
        }
    }

    /**
     * Load liked songs from the database
     * @returns {Promise<Array>} Array of liked songs
     */
    async _loadLikedSongsFromDatabase() {
        console.log('Loading liked songs from database...');
        
        // Check authentication status safely
        let isUserAuthenticated = false;
        try {
            isUserAuthenticated = typeof window.isAuthenticated === 'function' && window.isAuthenticated();
            console.log('Authentication status:', isUserAuthenticated);
        } catch (authError) {
            console.error('Error checking authentication status:', authError);
            this._showNotification('Error checking authentication status', 'error');
            return [];
        }
        
        if (!isUserAuthenticated) {
            console.log('User not authenticated, skipping database load');
            return [];
        }
        
        try {
            const token = this._getAuthToken();
            if (!token) {
                console.error('Cannot load liked songs: No authentication token');
                this._showNotification('Cannot load liked songs: Not logged in', 'error');
                return [];
            }
            
            console.log('Fetching liked songs from API with auth token');
            
            // Add timeout and fetch options
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch('/api/liked-songs', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                let errorData = { error: response.statusText };
                try {
                    errorData = await response.json();
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }
                console.error('Failed to load liked songs:', errorData);
                this._showNotification(`Error loading liked songs: ${errorData.error || response.statusText}`, 'error');
                return [];
            }
            
            const data = await response.json();
            console.log('Raw API response:', data);
            
            if (!data || !Array.isArray(data.songs)) {
                console.error('Invalid response format:', data);
                this._showNotification('Error: Invalid response from server', 'error');
                return [];
            }
            
            // Process and validate each song
            const songs = data.songs
                .filter(song => song && song.id) // Filter out invalid songs
                .map(song => ({
                    ...song,
                    thumbnailUrl: song.thumbnailUrl || null,
                    isLiked: true
                }));
            
            console.log(`Successfully loaded ${songs.length} liked songs from database`);
            
            // Log details about the loaded songs
            if (songs.length > 0) {
                console.log('First few song IDs:', songs.slice(0, 3).map(s => s.id));
                console.log('Songs with thumbnails:', songs.filter(s => s.thumbnailUrl).length);
                console.log('Songs without thumbnails:', songs.filter(s => !s.thumbnailUrl).length);
            }
            
            return songs;
            
        } catch (error) {
            console.error('Exception in _loadLikedSongsFromDatabase:', error);
            this._showNotification('Error loading liked songs. Please try again.', 'error');
            return [];
        }
    }

    /**
     * Load liked songs if the user is authenticated
     * @private
     */
    async _loadLikedSongsIfAuthenticated() {
        console.log('Checking authentication status for liked songs...');
        
        // Render any existing liked songs immediately for better user experience
        if (Array.isArray(this.likedSongs) && this.likedSongs.length > 0) {
            console.log(`Rendering ${this.likedSongs.length} existing liked songs while checking authentication`);
            this._renderLikedSongs();
        }
        
        // Safe check for authentication module
        let isUserAuthenticated = false;
        let retryCount = 0;
        const maxRetries = 5; // Increased from 3 to 5
        
        // Try to get authentication status, with retry for race conditions
        while (retryCount < maxRetries) {
            if (typeof window.isAuthenticated === 'function') {
                try {
                    isUserAuthenticated = window.isAuthenticated();
                    if (isUserAuthenticated) {
                        // Also check if we have a valid token
                        const token = this._getAuthToken();
                        if (!token) {
                            console.log('User appears authenticated but no token found, waiting...');
                            isUserAuthenticated = false;
                        } else {
                            console.log('User is authenticated and has valid token');
                            break;
                        }
                    }
                } catch (authError) {
                    console.warn(`Auth check attempt ${retryCount + 1} failed:`, authError);
                }
            } else {
                console.log(`Auth function not available yet (attempt ${retryCount + 1}/${maxRetries})`);
            }
            
            retryCount++;
            if (retryCount < maxRetries) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000)); // Increased from 500ms to 1000ms
            }
        }
        
        console.log(`Authentication check complete: User ${isUserAuthenticated ? 'is' : 'is not'} authenticated`);
        
        // Load liked songs based on authentication status
        if (isUserAuthenticated) {
            try {
                console.log('User is authenticated, loading liked songs from database');
                const dbSongs = await this._loadLikedSongsFromDatabase();
                
                if (Array.isArray(dbSongs) && dbSongs.length > 0) {
                    console.log(`Loaded ${dbSongs.length} liked songs from database`);
                    
                    // Always use database songs as source of truth when authenticated
                    this.likedSongs = dbSongs;
                    this._saveToStorage();
                    
                    // Force a UI update with the latest data
                    this._renderLikedSongs();
                    
                    // Show success notification
                    this._showNotification(`Loaded ${dbSongs.length} liked songs from your account`, 'success');
                } else {
                    console.log('No liked songs found in database');
                    // Clear local storage if no songs in database
                    this.likedSongs = [];
                    this._saveToStorage();
                    this._renderLikedSongs();
                }
            } catch (error) {
                console.error('Error loading liked songs from database:', error);
                // Fall back to localStorage on error
                this._loadFromStorage();
            }
        } else {
            console.log('User is not authenticated, using liked songs from localStorage only');
            // For non-authenticated users, just use localStorage
            this._loadFromStorage();
        }
        
        // Always render the liked songs to ensure we show what we have
        this._renderLikedSongs();
    }

    /**
     * Update the like state for the current playing song
     */
    _updateCurrentSongLikeState() {
        try {
            const currentSongElement = document.getElementById('current-song');
            const currentArtistElement = document.getElementById('current-artist');
            const currentThumbnail = document.getElementById('current-thumbnail');
            
            if (!currentSongElement || !currentArtistElement || !currentThumbnail || 
                currentSongElement.textContent === 'No track selected') {
                console.log('No current song playing, not updating like state');
                return false;
            }
            
            const songTitle = currentSongElement.textContent;
            const artistName = currentArtistElement.textContent;
            
            // Try to get the song ID from the thumbnail
            let songId = this._extractSongId(currentThumbnail.src);
            
            console.log(`Checking like state for current song: "${songTitle}" by "${artistName}" (ID: ${songId})`);
            
            // First try to find the song by ID
            if (songId) {
                const isLiked = this.likedSongs.some(song => song && song.id === songId);
                console.log(`Current song ID ${songId} is liked: ${isLiked}`);
                this._updateLikeButtonUI(isLiked);
        return isLiked;
            }
            
            // If ID not found, try by title/artist
            if (songTitle && artistName) {
                const isLikedByMetadata = this.likedSongs.some(song => 
                    song && song.title === songTitle && song.artist === artistName
                );
                console.log(`Current song "${songTitle}" by "${artistName}" is liked: ${isLikedByMetadata}`);
                this._updateLikeButtonUI(isLikedByMetadata);
                return isLikedByMetadata;
            }
            
            // If we get here, the song is not liked
            console.log('Current song not found in liked songs');
            this._updateLikeButtonUI(false);
            return false;
        } catch (error) {
            console.error('Error in _updateCurrentSongLikeState:', error);
            return false;
        }
    }

    /**
     * Load liked songs into the main song list manager for playback
     * @param {Array} likedSongs - Array of liked song objects
     */
    _loadLikedSongsIntoMainMemory(likedSongs) {
        if (!likedSongs || likedSongs.length === 0) return;
        
        const loadIntoMemory = () => {
            // If the main musicPlayer has a songListManager, load the liked songs into it
            if (window.musicPlayer && window.musicPlayer.songListManager) {
                console.log('Loading liked songs into main SongListManager');
                window.musicPlayer.songListManager.loadLikedSongs(likedSongs);
            } else {
                console.warn('Main SongListManager not available, scheduling retry');
                // Try again after a short delay - the music player might still be initializing
                setTimeout(() => {
                    if (window.musicPlayer && window.musicPlayer.songListManager) {
                        console.log('SongListManager now available, loading liked songs');
                        window.musicPlayer.songListManager.loadLikedSongs(likedSongs);
                    } else {
                        console.error('Main SongListManager still not available after retry');
                    }
                }, 1000);
            }
        };
        
        // Execute immediately but also schedule a retry to ensure it happens after initialization
        loadIntoMemory();
    }
    
    /**
     * Load playlist songs into the main song list manager for playback
     * @param {Object} playlist - Playlist object with songs array
     */
    _loadPlaylistSongsIntoMainMemory(playlist) {
        if (!playlist || !playlist.songs || playlist.songs.length === 0) return;
        
        const loadIntoMemory = () => {
            // If the main musicPlayer has a songListManager, load the playlist songs into it
            if (window.musicPlayer && window.musicPlayer.songListManager) {
                console.log(`Loading ${playlist.songs.length} songs from playlist "${playlist.name}" into main SongListManager`);
                window.musicPlayer.songListManager.loadPlaylistSongs(playlist.songs);
            } else {
                console.warn('Main SongListManager not available, scheduling retry');
                // Try again after a short delay - the music player might still be initializing
                setTimeout(() => {
                    if (window.musicPlayer && window.musicPlayer.songListManager) {
                        console.log('SongListManager now available, loading playlist songs');
                        window.musicPlayer.songListManager.loadPlaylistSongs(playlist.songs);
                    } else {
                        console.error('Main SongListManager still not available after retry');
                    }
                }, 1000);
            }
        };
        
        // Execute immediately but also schedule a retry to ensure it happens after initialization
        loadIntoMemory();
    }

    /**
     * Clear all liked songs from both localStorage and database
     */
    async clearAllLikedSongs() {
        try {
            console.log('Clearing all liked songs');
            
            // First check if user is authenticated to clear from DB
            if (isAuthenticated()) {
                try {
                    const authToken = this._getAuthToken();
                    if (!authToken) {
                        console.error('No auth token available for clearAllLikedSongs');
                        throw new Error('Authentication required');
                    }
                    
                    // Call the API to clear liked songs from the database
                    const response = await fetch('/api/liked-songs/clear', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to clear liked songs from database');
                    }
                    
                    console.log('Successfully cleared liked songs from database');
                } catch (error) {
                    console.error('Error clearing liked songs from database:', error);
                    this._showNotification('Error clearing liked songs from server', 'error');
                    throw error; // Re-throw to prevent local storage clear on server error
                }
            }
            
            // Then clear from localStorage
            this.likedSongs = [];
            this._saveToStorage();
            
            // Update UI
            this._renderLikedSongs();
            
            // If main player exists, update its state as well
            if (window.musicPlayer && typeof window.musicPlayer.updateLikeStatus === 'function' && window.musicPlayer.currentSong) {
                window.musicPlayer.updateLikeStatus(window.musicPlayer.currentSong.id);
            }
            
            // Show success notification
            this._showNotification('All liked songs cleared', 'success');
            
            return true;
        } catch (error) {
            console.error('Error in clearAllLikedSongs:', error);
            return false;
        }
    }

    /**
     * Show confirmation dialog before clearing all liked songs
     * @private
     */
    _showClearAllConfirmation() {
        if (confirm('Are you sure you want to remove all your liked songs? This action cannot be undone.')) {
            this._clearAllLikedSongs();
        }
    }

    /**
     * Initialize the playlist manager
     */
    init() {
        console.log('Initializing PlaylistManager');
        try {
            // Load from local storage first for immediate display
            this._loadFromStorage();
            
            // Initialize playlists UI
            this._renderPlaylists();
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Load liked songs from database if authenticated
            // This ensures we have the latest data from the database
            if (typeof isAuthenticated === 'function' && isAuthenticated()) {
                console.log('User is authenticated, loading liked songs from database');
                this.loadLikedSongsFromDatabase()
                    .then(songs => {
                        console.log(`Loaded ${songs.length} liked songs from database`);
                    })
                    .catch(error => {
                        console.error('Error loading liked songs during initialization:', error);
                    });
            } else {
                console.log('User not authenticated, using local storage for liked songs');
            }
            
            console.log('PlaylistManager initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing PlaylistManager:', error);
            return false;
        }
    }

    /**
     * Refresh the playlist manager state after authentication change
     * Called when a user logs in or logs out
     */
    async refreshAfterAuthChange(isAuthenticated) {
        console.log('Refreshing playlist manager after auth change. Authenticated:', isAuthenticated);
        
        // Log current state before changes
        console.log(`Current liked songs count before refresh: ${this.likedSongs.length}`);
        
        if (isAuthenticated) {
            // User logged in, load their liked songs from database
            console.log('User logged in, loading liked songs from database');
            
            // Save current liked songs in case we need to merge
            const currentLikedSongs = [...this.likedSongs];
            
            // Load from database
            const dbSongs = await this._loadLikedSongsFromDatabase();
            console.log(`Loaded ${dbSongs.length} liked songs from database after login`);
            
            if (dbSongs.length > 0) {
                // Use database songs as source of truth
                this.likedSongs = dbSongs;
                
                // Also load into SongListManager for main player if available
                if (window.musicPlayer && window.musicPlayer.songListManager) {
                    try {
                        window.musicPlayer.songListManager.loadLikedSongs(dbSongs);
                        console.log('Updated main player with liked songs from database');
                    } catch (loadError) {
                        console.error('Error loading liked songs into main player:', loadError);
                    }
                }
            } else if (currentLikedSongs.length > 0) {
                // If database has no songs but we have local songs, keep the local ones
                console.log('Database empty but local songs exist, keeping local songs');
                this.likedSongs = currentLikedSongs;
            }
        } else {
            // User logged out, load from localStorage
            console.log('User logged out, loading liked songs from localStorage');
            this.likedSongs = this._loadFromStorage() || [];
        }
        
        // Save current state to localStorage
        this._saveToStorage();
        
        // Update UI
        console.log('Updating UI with liked songs count:', this.likedSongs.length);
        this._renderLikedSongs();
        this._updateAllSongLikeStates();
        this._updateCurrentSongLikeState();
        
        // Log final state
        console.log('Refresh complete. Current liked songs count:', this.likedSongs.length);
    }

    /**
     * Get the authentication token from the auth module
     * @returns {string|null} The auth token or null if not authenticated
     */
    _getAuthToken() {
        console.log('Getting auth token');
        try {
            // First check if the function exists in window scope
            if (typeof window.getAuthToken === 'function') {
                console.log('Using global getAuthToken function');
                return window.getAuthToken();
            }
            
            // Fallback to localStorage if necessary
            // We use 'auth_token' to match what's set in auth.js
            const token = localStorage.getItem('auth_token');
            if (token) {
                console.log('Retrieved token from localStorage (auth_token)');
                return token;
            }
            
            console.warn('No auth token available');
            return null;
        } catch (err) {
            console.error('Error getting auth token:', err);
            return null;
        }
    }

    /**
     * Update like status for all songs in all visible lists
     * @private
     */
    _updateAllSongLikeStates() {
        try {
            // Get all song rows and cards in the document
            const songElements = document.querySelectorAll('.song-row[data-song-id], .song-card[data-song-id]');
            console.log(`Updating like states for ${songElements.length} song elements`);
            
            // Process each song element
            songElements.forEach(element => {
                const songId = element.getAttribute('data-song-id');
                if (songId) {
                    // Check if this song is liked
                    const isLiked = this.likedSongs.some(song => song && song.id === songId);
                    
                    // Update UI for this row
                    const heartIcon = element.querySelector('.heart-icon, .fa-heart');
                    const likeButton = element.querySelector('.like-button');
                    
                    if (heartIcon) {
                        if (isLiked) {
                            heartIcon.classList.remove('far');
                            heartIcon.classList.add('fas');
                            if (likeButton) {
                                likeButton.classList.add('liked');
                            }
                        } else {
                            heartIcon.classList.remove('fas');
                            heartIcon.classList.add('far');
                            if (likeButton) {
                                likeButton.classList.remove('liked');
                            }
                        }
                    }
                }
            });
            
            // Update the main player's like button
            if (window.musicPlayer && window.musicPlayer.currentSong) {
                this._updateLikeButtonState(window.musicPlayer.currentSong.id);
            }
        } catch (error) {
            console.error('Error updating all song like states:', error);
        }
    }

    /**
     * Set up a mutation observer to find the liked songs container when it becomes available
     * @private
     */
    _setupContainerObserver() {
        console.log('Setting up mutation observer to find liked-songs-list element');
        
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    const container = document.getElementById('liked-songs-list');
                    if (container) {
                        this.likedSongsContainer = container;
                        console.log('Liked songs container (liked-songs-list) found by observer');
                        observer.disconnect();
                        
                        // Now that we have the container, render the liked songs
                        this._renderLikedSongs();
                        this.containerUpdated = true;
                        break;
                    }
                }
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('Container observer setup complete - watching for liked-songs-list element');
    }

    /**
     * Initialize liked songs from localStorage without clearing existing data
     * @private
     */
    _initializeFromStorage() {
        try {
            const storedSongs = localStorage.getItem('likedSongs');
            if (storedSongs) {
                const parsedSongs = JSON.parse(storedSongs);
                if (Array.isArray(parsedSongs) && parsedSongs.length > 0) {
                    this.likedSongs = parsedSongs;
                    console.log(`Loaded ${parsedSongs.length} liked songs from localStorage`);
                } else {
                    console.log('No liked songs found in localStorage');
                }
            } else {
                console.log('No liked songs entry in localStorage');
            }
        } catch (error) {
            console.error('Error loading liked songs from localStorage:', error);
        }
        
        // Load liked songs from database if the user is authenticated
        this._loadLikedSongsIfAuthenticated();
    }

    /**
     * Handle liked view activation
     * @private
     */
    _handleLikedViewActivated() {
        console.log('Liked view activated with', this.likedSongs.length, 'songs');
        
        // If the container was not found during initialization, try to find it now
        if (!this.likedSongsContainer) {
            this.likedSongsContainer = document.getElementById('liked-songs-list');
            if (this.likedSongsContainer) {
                console.log('Found liked songs container on view activation');
                this.containerUpdated = true;
            } else {
                console.error('Liked songs container still not found');
                return;
            }
        }
        
        // Log current state for debugging
        if (Array.isArray(this.likedSongs)) {
            console.log(`Rendering ${this.likedSongs.length} liked songs in liked view`);
            console.log('First few liked song IDs:', this.likedSongs.slice(0, 3).map(s => s.id));
        } else {
            console.warn('Liked songs array is not properly initialized');
        }
        
        // Render the liked songs again just to ensure we're showing all of them
        this._renderLikedSongs();
        
        // Refresh from database if authenticated
        if (typeof window.isAuthenticated === 'function' && window.isAuthenticated()) {
            this._loadLikedSongsFromDatabase()
                .then(songs => {
                    console.log(`Refreshed ${songs.length} liked songs from database`);
                })
                .catch(error => {
                    console.error('Error refreshing liked songs:', error);
                });
        } else {
            console.log('User not authenticated, using local storage data only');
        }
    }

    /**
     * Clear all liked songs
     * @private
     */
    _clearAllLikedSongs() {
        if (confirm('Are you sure you want to clear all liked songs?')) {
            console.log('Clearing all liked songs');
            this.likedSongs = [];
            this._saveToStorage();
            this._renderLikedSongs();
            
            // If user is authenticated, also clear likes from the database
            if (typeof window.isAuthenticated === 'function' && window.isAuthenticated()) {
                try {
                    const token = this._getAuthToken();
                    if (token) {
                        fetch('/api/clear-all-likes', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => {
                            if (response.ok) {
                                console.log('Successfully cleared all likes from database');
                            } else {
                                console.error('Failed to clear likes from database');
                            }
                        })
                        .catch(error => {
                            console.error('Error clearing likes from database:', error);
                        });
                    }
                } catch (error) {
                    console.error('Error during database likes clearing:', error);
                }
            }
        }
    }

    /**
     * Get the authentication token
     * @private
     * @returns {string|null} The authentication token or null if not available
     */
    _getAuthToken() {
        try {
            if (typeof window.getAuthToken === 'function') {
                return window.getAuthToken();
            } else {
                // Fallback: Try to get from localStorage directly
                return localStorage.getItem('authToken');
            }
        } catch (error) {
            console.error('Error getting auth token:', error);
            return null;
        }
    }

    /**
     * Toggle like state for a specific song by ID
     * Used in song card clicks and other direct interactions
     * @param {string} songId - The ID of the song to toggle like status
     * @private
     */
    async _toggleLike(songId) {
        console.log(`_toggleLike called for song ID: ${songId}`);
        
        if (!songId) {
            console.error('Cannot toggle like: No song ID provided');
            return;
        }
        
        // Prevent rapid clicking and race conditions
        if (this.isProcessingLikeClick) {
            console.log('Already processing a like click, ignoring');
            return;
        }
        
        this.isProcessingLikeClick = true;
        
        try {
            // Find the song in our liked songs array
            const songIndex = this.likedSongs.findIndex(song => song && song.id === songId);
            const isCurrentlyLiked = songIndex !== -1;
            
            console.log(`Song ${songId} is currently ${isCurrentlyLiked ? 'liked' : 'not liked'}`);
            
            // Get the song data - either from our liked songs or from the song list
            let songData;
            if (isCurrentlyLiked) {
                songData = this.likedSongs[songIndex];
            } else {
                // Try to find in the main player's song list
                if (window.musicPlayer && window.musicPlayer.songListManager) {
                    const allSongs = window.musicPlayer.songListManager.songs || [];
                    songData = allSongs.find(s => s && s.id === songId);
                }
                
                // If we still don't have song data, create minimal record
                if (!songData) {
                    console.warn(`Song ${songId} not found in liked songs or song list, creating minimal record`);
                    songData = { 
                        id: songId,
                        title: 'Unknown Song',
                        artist: 'Unknown Artist',
                        album: 'Unknown Album'
                    };
                }
            }
            
            // Update database first if user is authenticated
            const isAuthenticated = typeof window.isAuthenticated === 'function' && window.isAuthenticated();
            
            if (isAuthenticated) {
                console.log(`Updating database for song ${songId}: ${isCurrentlyLiked ? 'unlike' : 'like'} operation (database first)`);
                
                // Show loading notification for long operations
                const loadingTimeoutId = setTimeout(() => {
                    this._showNotification('Processing change...', 'info');
                }, 300);
                
                try {
                    // Call the appropriate database method
                    const success = isCurrentlyLiked 
                        ? await this._unlikeSongInDatabase(songId)
                        : await this._likeSongInDatabase(songId);
                    
                    clearTimeout(loadingTimeoutId);
                    
                    if (success) {
                        console.log(`Database updated successfully for song ${songId}`);
                        
                        // Only update local state after successful database update
                        if (isCurrentlyLiked) {
                            // Remove from liked songs
                            this.likedSongs.splice(songIndex, 1);
                            console.log(`Removed song ${songId} from liked songs array after database update`);
                        } else {
                            // Add to liked songs
                            this.likedSongs.push(songData);
                            console.log(`Added song ${songId} to liked songs array after database update`);
                        }
                        
                        // Update UI after database confirms change
                        this._updateLikeButtonUI(!isCurrentlyLiked);
                        this._updateSongLikeStateInLists(songId, !isCurrentlyLiked);
                        this._updateCurrentSongLikeState();
                        
                        // Save to localStorage to match database
                        this._saveToStorage();
                        
                        // Refresh liked songs display
                        this._renderLikedSongs();
                        
                        // Show success notification
                        this._showNotification(
                            isCurrentlyLiked 
                                ? `Removed "${songData.title}" from Liked Songs` 
                                : `Added "${songData.title}" to Liked Songs`, 
                            'success'
                        );
                    } else {
                        // Database operation failed
                        console.error(`Database update failed for song ${songId}`);
                        this._showNotification('Failed to update server. Please try again.', 'error');
                    }
                } catch (error) {
                    clearTimeout(loadingTimeoutId);
                    console.error(`Error ${isCurrentlyLiked ? 'unliking' : 'liking'} song in database:`, error);
                    this._showNotification('Error updating server. Please check your connection.', 'error');
                }
            } else {
                // Not authenticated, update local storage only
                console.log('User not authenticated, updating local storage only');
                
                if (isCurrentlyLiked) {
                    // Remove from liked songs
                    this.likedSongs.splice(songIndex, 1);
                } else {
                    // Add to liked songs
                    this.likedSongs.push(songData);
                }
                
                // Update UI
                this._updateLikeButtonUI(!isCurrentlyLiked);
                this._updateSongLikeStateInLists(songId, !isCurrentlyLiked);
                this._updateCurrentSongLikeState();
                
                // Save to localStorage
                this._saveToStorage();
                
                // Refresh liked songs display
                this._renderLikedSongs();
                
                this._showNotification(
                    isCurrentlyLiked 
                        ? `Removed "${songData.title}" from Liked Songs` 
                        : `Added "${songData.title}" to Liked Songs`, 
                    'success'
                );
            }
        } catch (error) {
            console.error('Error in _toggleLike:', error);
            this._showNotification('Error updating like status', 'error');
        } finally {
            // Allow future operations after a small delay
            setTimeout(() => {
                this.isProcessingLikeClick = false;
            }, 300);
        }
    }

    /**
     * Helper method to revert a like state change when database operations fail
     * @param {string} songId - The song ID
     * @param {Object} songData - The song data
     * @param {boolean} wasLiked - Whether the song was liked before the change
     * @private
     */
    _revertLikeStateChange(songId, songData, wasLiked) {
        console.log(`Reverting like state change for song ${songId} to ${wasLiked ? 'liked' : 'not liked'}`);
        
        if (wasLiked) {
            // Song was liked before, add it back
            this.likedSongs.push(songData);
            this._updateLikeButtonUI(true);
            this._updateSongLikeStateInLists(songId, true);
        } else {
            // Song was not liked before, remove it
            const index = this.likedSongs.findIndex(song => song && song.id === songId);
            if (index !== -1) {
                this.likedSongs.splice(index, 1);
            }
            this._updateLikeButtonUI(false);
            this._updateSongLikeStateInLists(songId, false);
        }
    }
}

// Initialize the playlist manager when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.playlistManager = new PlaylistManager();
});

export default PlaylistManager; 