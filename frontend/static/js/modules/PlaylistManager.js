import { isAuthenticated } from './supabase/auth.js';

class PlaylistManager {
    constructor() {
        // Initialize properties
        this.playlists = [];
        this.likedSongs = [];
        
        // DOM elements
        this.playlistContainer = document.querySelector('.playlists-container');
        this.playlistModal = document.getElementById('playlist-modal');
        this.playlistForm = document.getElementById('create-playlist-form');
        this.closePlaylistModalBtn = this.playlistModal ? this.playlistModal.querySelector('.close-modal') : null;
        this.likeButton = document.getElementById('like-current-song');
        this.createPlaylistBtn = document.getElementById('create-playlist');
        
        // Add to playlist modal elements
        this.addToPlaylistModal = document.getElementById('add-to-playlist-modal');
        this.closeAddToPlaylistModalBtn = this.addToPlaylistModal ? this.addToPlaylistModal.querySelector('.close-modal') : null;
        
        // Navigation links
        this.navLinks = document.querySelectorAll('nav a[data-view]');
        
        // View containers
        this.viewContainers = document.querySelectorAll('.view-container');
        
        // Templates
        this.playlistViewTemplate = document.getElementById('playlist-view-template');
        
        // Reset liked songs in localStorage (for debugging purposes)
        localStorage.removeItem('likedSongs');
        
        // Load data from localStorage
        this._loadFromStorage();
        
        // Load liked songs from database if the user is authenticated
        this._loadLikedSongsIfAuthenticated();
        
        // Set up event listeners
        this._setupEventListeners();
        
        // Render initial UI
        this._renderPlaylists();
        this._renderLikedSongs();
        
        console.log('PlaylistManager initialized', {
            playlists: this.playlists.length,
            likedSongs: this.likedSongs.length,
            createBtn: !!this.createPlaylistBtn,
            playlistModal: !!this.playlistModal,
            closeBtn: !!this.closePlaylistModalBtn
        });
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
            // Load playlists from localStorage
            const savedPlaylists = localStorage.getItem('playlists');
            if (savedPlaylists) {
                this.playlists = JSON.parse(savedPlaylists);
                console.log('Loaded playlists from storage:', this.playlists.length);
            }
            
            // Load liked songs from localStorage
            const savedLikedSongs = localStorage.getItem('likedSongs');
            if (savedLikedSongs) {
                this.likedSongs = JSON.parse(savedLikedSongs);
                console.log('Loaded liked songs from storage:', this.likedSongs.length);
            } else {
                // Ensure we start with an empty array if nothing is in localStorage
                this.likedSongs = [];
                console.log('No liked songs in storage, starting with empty array');
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            // Initialize with empty arrays as fallback
            this.playlists = [];
            this.likedSongs = [];
        }
    }
    
    _saveToStorage() {
        try {
            // Save playlists to localStorage
            localStorage.setItem('playlists', JSON.stringify(this.playlists));
            
            // Save liked songs to localStorage
            localStorage.setItem('likedSongs', JSON.stringify(this.likedSongs));
            
            console.log('Saved to localStorage:', {
                playlists: this.playlists.length,
                likedSongs: this.likedSongs.length
            });
        } catch (error) {
            console.error('Error saving to localStorage:', error);
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
    
    _renderLikedSongs() {
        console.log('Rendering liked songs view');
        
        // Find the liked songs view container
        const likedView = document.getElementById('liked-view');
        if (!likedView) {
            console.error('Liked songs view container not found');
            return;
        }
        
        // Find or create the songs list container
        let likedSongsList = likedView.querySelector('#liked-songs-list');
        let likedSongsCount = likedView.querySelector('#liked-songs-count');
        
        if (!likedSongsList || !likedSongsCount) {
            console.warn('Liked songs list elements not found, creating them');
            
            // Create container for liked songs table
            const container = document.createElement('div');
            container.className = 'liked-songs-container';
            
            // Create header with count
            const header = document.createElement('div');
            header.className = 'liked-songs-header';
            header.innerHTML = `
                <h2>Liked Songs</h2>
                <span id="liked-songs-count">${this.likedSongs.length} songs</span>
            `;
            
            // Create table
            const table = document.createElement('table');
            table.className = 'liked-songs-table';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="song-number">#</th>
                        <th class="song-title">Title</th>
                        <th class="song-album">Album</th>
                        <th class="song-duration">Duration</th>
                        <th class="song-actions"></th>
                    </tr>
                </thead>
                <tbody id="liked-songs-list"></tbody>
            `;
            
            // Add elements to container
            container.appendChild(header);
            container.appendChild(table);
            
            // Add container to view
            likedView.appendChild(container);
            
            // Update references
            likedSongsList = table.querySelector('#liked-songs-list');
            likedSongsCount = header.querySelector('#liked-songs-count');
        } else {
            // Update the count text
            likedSongsCount.textContent = `${this.likedSongs.length} songs`;
        }
        
        // Clear the list
        likedSongsList.innerHTML = '';
        
        // If no liked songs, show a message
        if (this.likedSongs.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-row';
            emptyRow.innerHTML = '<td colspan="5" class="empty-message">No liked songs yet. Like a song to see it here!</td>';
            likedSongsList.appendChild(emptyRow);
            return;
        }
        
        // Add each song to the list
        this.likedSongs.forEach((song, index) => {
            if (!song) {
                console.warn('Found null song in liked songs at index', index);
                return; // Skip null songs
            }
            
            // Format song duration
            const duration = song.duration ? this._formatDuration(song.duration) : '--:--';
            
            // Format song thumbnail URL without cache busting
            const thumbnailUrl = song.thumbnailUrl || `/api/thumbnail/${song.id}`;
            
            // Create row for this song
            const row = document.createElement('tr');
            row.className = 'song-row';
            row.setAttribute('data-song-id', song.id);
            
            // Set row content
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
                <td class="song-duration">${duration}</td>
                <td class="song-actions">
                    <button class="like-button liked" data-song-id="${song.id}">
                        <i class="fas fa-heart heart-icon"></i>
                    </button>
                    <button class="add-to-playlist-button" data-song-id="${song.id}">
                        <i class="fas fa-plus"></i>
                    </button>
                </td>
            `;
            
            // Add click handler to play the song
            row.addEventListener('click', (e) => {
                // Don't handle clicks on buttons
                if (e.target.tagName === 'BUTTON' || 
                    e.target.closest('button') || 
                    e.target.tagName === 'I') {
                    return;
                }
                
                // Play the song
                this._playSong(song);
            });
            
            // Add like button handler
            const likeButton = row.querySelector('.like-button');
            if (likeButton) {
                likeButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent row click
                    this.unlikeSong(song.id);
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
            
            // Add to likedSongsList
            likedSongsList.appendChild(row);
        });
        
        // Setup lazy loading for thumbnails
        this._setupLazyLoading();
        
        // Make sure songListManager has all songs loaded into memory
        if (window.app && window.app.songListManager) {
            window.app.songListManager.loadLikedSongs(this.likedSongs);
        }
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
        
        const attemptPlay = (retries = 3) => {
            // Check if the main player is available
            if (window.musicPlayer) {
                // Find the song in the main player's song list
                const mainPlayerSong = window.musicPlayer.songListManager?.songs?.find(s => 
                    s.id === song.id || s.title === song.title
                );
                
                if (mainPlayerSong) {
                    window.musicPlayer.playSong(mainPlayerSong);
                } else {
                    // If not found in main player, try to play directly
                    window.musicPlayer.playSong(song);
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
     * Update the like button state based on the current song
     * @param {string} songId - ID of the current song
     */
    _updateLikeButtonState(songId) {
        if (!this.likeButton) {
            console.warn('Like button element not found');
            return;
        }
        
        // Check if the song is in the liked songs list
        const isLiked = this.likedSongs.some(song => 
            song && song.id === songId
        );
        
        console.log('Checking if song is liked:', {
            id: songId,
            isLiked: isLiked
        });
        
        // Update UI
        this._updateLikeButtonUI(isLiked);
    }
    
    /**
     * Update the like button UI based on like state
     * @param {boolean} isLiked - Whether the song is liked
     */
    _updateLikeButtonUI(isLiked) {
        if (!this.likeButton) {
            console.warn('Like button element not found');
            return;
        }
        
        console.log('Current like button state:', this.likeButton.classList.contains('liked'));
        console.log('Updating like button UI to:', isLiked);
        
        // Update button class
        if (isLiked) {
            this.likeButton.classList.add('liked');
        } else {
            this.likeButton.classList.remove('liked');
        }
        
        // Update icon classes
        const heartIcon = this.likeButton.querySelector('i');
        if (heartIcon) {
            if (isLiked) {
                heartIcon.className = heartIcon.className.replace('far', 'fas');
            } else {
                heartIcon.className = heartIcon.className.replace('fas', 'far');
            }
        }
    }
    
    toggleLike() {
        // Prevent multiple rapid clicks
        if (this.isProcessingLikeClick) {
            console.log('Already processing a like click, ignoring');
            return;
        }
        
        // Set processing flag
        this.isProcessingLikeClick = true;
        
        try {
            // Get current song info
            const currentSongElement = document.getElementById('current-song');
            const currentArtistElement = document.getElementById('current-artist');
            const currentThumbnail = document.getElementById('current-thumbnail');
            
            // Check if we have all required elements
            if (!currentSongElement || !currentArtistElement || !currentThumbnail) {
                console.error('Required DOM elements for current song not found');
                this._showNotification('Unable to like song: player elements not found', 'error');
                this.isProcessingLikeClick = false;
                return;
            }
            
            // Check if a song is playing
            if (currentSongElement.textContent === 'No track selected') {
                this._showNotification('No song is currently playing', 'info');
                this.isProcessingLikeClick = false;
                return;
            }
            
            // Get current song details
            const songTitle = currentSongElement.textContent;
            const artistName = currentArtistElement.textContent;
            const thumbnailSrc = currentThumbnail.src;
            
            // Extract the actual song ID from the thumbnail URL or audio source
            // This should match the ID in the database
            const songId = this._extractActualSongId(thumbnailSrc);
            if (!songId) {
                this._showNotification('Unable to determine song ID', 'error');
                this.isProcessingLikeClick = false;
                return;
            }
            
            // Find the song in our liked songs list
            const songIndex = this._findSongIndex(songId, songTitle, artistName);
            
            // Define a song object from current player data
            const song = {
                id: songId,
                title: songTitle,
                artist: artistName,
                thumbnailUrl: thumbnailSrc
            };
            
            // Toggle like state
            if (songIndex === -1) {
                // Song is not currently liked, add it
                console.log('Adding song to liked songs:', song);
                this.likedSongs.push(song);
                
                // Update database if authenticated
                this._likeSongInDatabase(songId);
                
                // Update UI
                this._updateLikeButtonState(songId);
                
                // Update like state in all song lists
                this._updateSongLikeStateInLists(songId, true);
                
                // Show notification
                this._showNotification('Added to Liked Songs', 'success');
            } else {
                // Song is already liked, remove it
                console.log('Removing song from liked songs:', this.likedSongs[songIndex]);
                this.likedSongs.splice(songIndex, 1);
                
                // Update database if authenticated
                this._unlikeSongInDatabase(songId);
                
                // Update UI
                this._updateLikeButtonState(songId);
                
                // Update like state in all song lists
                this._updateSongLikeStateInLists(songId, false);
                
                // Show notification
                this._showNotification('Removed from Liked Songs', 'info');
            }
            
            // Save updated list to localStorage
            this._saveToStorage();
            
            // Update the liked songs view if it exists
            this._renderLikedSongs();
            
        } catch (error) {
            console.error('Error toggling like state:', error);
            this._showNotification('Error updating like status', 'error');
        } finally {
            // Clear processing flag
            this.isProcessingLikeClick = false;
        }
    }
    
    // Helper method to extract the actual song ID from various sources
    _extractActualSongId(src) {
        // First try to get it from the audio player source
        const audioPlayer = document.querySelector('audio');
        if (audioPlayer && audioPlayer.src) {
            // Try to extract from stream URL first (most reliable)
            const streamMatch = audioPlayer.src.match(/\/api\/stream\/(\d+)/);
            if (streamMatch && streamMatch[1]) {
                console.log('Extracted ID from audio stream URL:', streamMatch[1]);
                return streamMatch[1];
            }
        }
        
        // Then try from the thumbnail
        if (src) {
            // Try API thumbnail format
            const apiMatch = src.match(/\/api\/thumbnail\/(\d+)/);
            if (apiMatch && apiMatch[1]) {
                console.log('Extracted ID from API thumbnail:', apiMatch[1]);
                return apiMatch[1];
            }
            
            // Try direct number format
            const numberMatch = src.match(/\/(\d+)\.jpg$/);
            if (numberMatch && numberMatch[1]) {
                console.log('Extracted ID from image filename:', numberMatch[1]);
                return numberMatch[1];
            }
            
            // Try to extract just a numeric ID if it exists in the URL
            const numericIdMatch = src.match(/(\d+)/);
            if (numericIdMatch && numericIdMatch[1]) {
                console.log('Extracted numeric ID:', numericIdMatch[1]);
                return numericIdMatch[1];
            }
        }
        
        // If we're here, we couldn't find a numeric ID
        return null;
    }
    
    // Add helper methods for database operations
    async _likeSongInDatabase(songId) {
        try {
            // Get auth token
            const authToken = this._getAuthToken();
            if (!authToken) {
                console.warn('User not authenticated, skipping database like operation');
                return;
            }
            
            const response = await fetch('/api/like-song', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ songId })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to like song in database');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error liking song in database:', error);
            throw error;
        }
    }

    async _unlikeSongInDatabase(songId) {
        try {
            // Get auth token
            const authToken = this._getAuthToken();
            if (!authToken) {
                console.warn('User not authenticated, skipping database unlike operation');
                return;
            }
            
            const response = await fetch('/api/unlike-song', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ songId })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to unlike song in database');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error unliking song in database:', error);
            throw error;
        }
    }

    _getAuthToken() {
        try {
            // Check if we have access to the Supabase client directly
            if (window.app && window.app.supabase) {
                const session = window.app.supabase.auth.session();
                if (session && session.access_token) {
                    return session.access_token;
                }
            }
            
            // Check for token in modern Supabase v2 format
            const supabaseAuth = localStorage.getItem('sb-knacnvnqdvpsfkkrufmo-auth-token');
            if (supabaseAuth) {
                try {
                    const authData = JSON.parse(supabaseAuth);
                    if (authData.access_token) {
                        return authData.access_token;
                    }
                } catch (e) {
                    console.warn('Failed to parse Supabase v2 auth token:', e);
                }
            }
            
            // Try to get from localStorage - older format
            const supabaseSession = localStorage.getItem('supabase.auth.token');
            if (supabaseSession) {
                try {
                    const sessionData = JSON.parse(supabaseSession);
                    if (sessionData.currentSession && sessionData.currentSession.access_token) {
                        return sessionData.currentSession.access_token;
                    }
                } catch (e) {
                    console.warn('Failed to parse Supabase auth token:', e);
                }
            }
            
            // Try one more format
            const simpleSession = localStorage.getItem('supabase_session');
            if (simpleSession) {
                try {
                    const sessionData = JSON.parse(simpleSession);
                    return sessionData.access_token || null;
                } catch (e) {
                    console.warn('Failed to parse simple session token:', e);
                }
            }
            
            console.log('No authentication token found in any storage location');
            return null;
        } catch (error) {
            console.error('Error getting auth token:', error);
            return null;
        }
    }
    
    // Add a new helper method to update song like state in all song lists
    _updateSongLikeStateInLists(songId, isLiked) {
        // Update heart icons in all song lists for this song
        document.querySelectorAll('.song-row').forEach(row => {
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
    
    // Helper method to extract song ID from various formats
    _extractSongId(src) {
        if (!src) return null;
        
        console.log('Extracting song ID from src:', src);
        
        // Try API thumbnail format
        const apiMatch = src.match(/\/api\/thumbnail\/(\d+)/);
        if (apiMatch && apiMatch[1]) {
            console.log('Extracted ID from API thumbnail:', apiMatch[1]);
            return apiMatch[1];
        }
        
        // Try static audio format
        const staticMatch = src.match(/\/static\/audio\/([^.]+)/);
        if (staticMatch && staticMatch[1]) {
            console.log('Extracted ID from static audio:', staticMatch[1]);
            return staticMatch[1];
        }
        
        // Try direct number format
        const numberMatch = src.match(/\/(\d+)\.jpg$/);
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

    // Add this new method for setting the initial like state when a song is played
    setInitialLikeState(songId, songTitle, artistName) {
        console.log('Setting initial like state for:', {
            id: songId,
            title: songTitle,
            artist: artistName
        });
        
        // First check our liked songs list
        let isLiked = false;
        
        // If the song ID is not a numeric ID, try to extract it
        if (songId && isNaN(Number(songId)) && songId.includes('-')) {
            // This might be a title-artist based ID, try to find the numeric ID if possible
            const audioPlayer = document.querySelector('audio');
            if (audioPlayer && audioPlayer.src) {
                const extractedId = this._extractActualSongId(audioPlayer.src);
                if (extractedId) {
                    console.log(`Converted ID from "${songId}" to "${extractedId}"`);
                    songId = extractedId;
                }
            }
        }
        
        // Create a normalized ID from title/artist if not provided
        if (!songId && songTitle && artistName) {
            // Try to find a song with matching title/artist in our liked songs first
            const match = this.likedSongs.find(song => 
                song && song.title === songTitle && song.artist === artistName);
            
            if (match && match.id) {
                songId = match.id;
            } else {
                // Fallback to generating an ID
                songId = `${songTitle}-${artistName}`.replace(/[^\w]/g, '-').toLowerCase();
            }
        }
        
        if (this.likedSongs && this.likedSongs.length > 0) {
            for (const song of this.likedSongs) {
                if (!song) continue;
                
                // Check by ID
                if (songId && song.id === songId) {
                    isLiked = true;
                    break;
                }
                
                // Check by title and artist
                if (songTitle && artistName && 
                    song.title === songTitle && 
                    song.artist === artistName) {
                    isLiked = true;
                    break;
                }
            }
        }
        
        console.log(`Song "${songTitle}" like status: ${isLiked}`);
        
        // Update UI
        this._updateLikeButtonUI(isLiked);
        
        return isLiked;
    }

    /**
     * Load liked songs from the database
     * @returns {Promise<Array>} Array of liked songs
     */
    async _loadLikedSongsFromDatabase() {
        if (!isAuthenticated()) return [];
        
        try {
            const authToken = this._getAuthToken();
            if (!authToken) return [];
            
            console.log('Loading liked songs from database');
            
            // Check if we've loaded songs in the last 5 minutes
            const lastLikedSongsLoad = localStorage.getItem('lastLikedSongsLoad');
            const likedSongsData = localStorage.getItem('likedSongs');
            
            if (lastLikedSongsLoad && likedSongsData) {
                const timeSinceLastLoad = Date.now() - parseInt(lastLikedSongsLoad);
                const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes in milliseconds
                
                if (timeSinceLastLoad < FIVE_MINUTES) {
                    console.log('Using cached liked songs from localStorage (loaded within last 5 minutes)');
                    try {
                        return JSON.parse(likedSongsData);
                    } catch (e) {
                        console.error('Error parsing cached liked songs, will fetch new ones:', e);
                    }
                }
            }
            
            // Fetch from API with caching headers
            const response = await fetch('/api/liked-songs', {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Cache-Control': 'max-age=300' // Cache for 5 minutes
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.songs && Array.isArray(data.songs)) {
                    // Update the liked songs in storage with timestamp
                    localStorage.setItem('likedSongs', JSON.stringify(data.songs));
                    localStorage.setItem('lastLikedSongsLoad', Date.now().toString());
                    
                    return data.songs;
                }
            } else {
                console.error('Error loading liked songs:', response.status, response.statusText);
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error loading liked songs from database:', error);
            // Return empty array on error
            return [];
        }
        
        return [];
    }

    /**
     * Load liked songs from database and update UI
     * This method handles formatting and updating the UI
     */
    async _loadLikedSongsIfAuthenticated() {
        if (!isAuthenticated()) {
            console.log('User not authenticated, skipping database load');
            return;
        }
        
        try {
            // Fetch the raw liked songs data
            const likedSongsData = await this._loadLikedSongsFromDatabase();
            
            if (!likedSongsData || !Array.isArray(likedSongsData) || likedSongsData.length === 0) {
                console.log('No liked songs data returned from database');
                return;
            }
            
            console.log(`Loaded ${likedSongsData.length} liked songs from database`);
            
            // Format songs to match our internal format
            const formattedSongs = likedSongsData.map(song => ({
                id: song.id.toString(),
                title: song.title || 'Unknown Title',
                artist: song.artist || 'Unknown Artist',
                album: song.album || 'Unknown Album',
                duration: song.duration || 0,
                thumbnailUrl: song.thumbnail_url || null
            }));
            
            // Replace our local data only if we got songs from the database
            if (formattedSongs.length > 0) {
                this.likedSongs = formattedSongs;
                
                // Update localStorage with the latest data
                this._saveToStorage();
                
                // Only update the UI if this view is active to avoid unnecessary DOM operations
                const likedView = document.getElementById('liked-view');
                if (likedView && likedView.classList.contains('active')) {
                    this._renderLikedSongs();
                }
                
                // Update the like button state if a song is currently playing
                this._updateCurrentSongLikeState();
                
                // Load liked songs into the main SongListManager for playback if available
                if (window.app && window.app.songListManager) {
                    window.app.songListManager.loadLikedSongs(formattedSongs);
                }
            }
        } catch (error) {
            console.error('Error in _loadLikedSongsIfAuthenticated:', error);
        }
    }

    /**
     * Update the like state for the current playing song
     */
    _updateCurrentSongLikeState() {
        const currentSongElement = document.getElementById('current-song');
        const currentArtistElement = document.getElementById('current-artist');
        
        if (currentSongElement && currentArtistElement && 
            currentSongElement.textContent !== 'No track selected') {
            const songTitle = currentSongElement.textContent;
            const artistName = currentArtistElement.textContent;
            const currentThumbnail = document.getElementById('current-thumbnail');
            
            if (currentThumbnail) {
                const songId = this._extractActualSongId(currentThumbnail.src);
                if (songId) {
                    this._updateLikeButtonState(songId);
                } else {
                    this.setInitialLikeState(null, songTitle, artistName);
                }
            }
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
}

// Initialize the playlist manager when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.playlistManager = new PlaylistManager();
});

export default PlaylistManager; 