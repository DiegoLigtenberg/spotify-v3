class SongListManager {
    constructor(container, options = {}) {
        this.container = container;
        this.songs = [];
        this.currentOffset = 0;
        this.hasMoreSongs = true;
        this.isLoading = false;
        this.totalSongsCount = 0;
        this.loadCooldown = false;
        this.songIdSet = new Set(); // Track song IDs to avoid duplicates
        this.randomMode = options.randomMode || false; // Random mode toggle
        
        // Configuration
        this.config = {
            totalSongs: options.totalSongs || 70,    // Total songs to keep in memory
            visibleSongs: options.visibleSongs || 30, // Number of songs visible in viewport
            loadChunk: options.loadChunk || 20,      // Number of songs to load/remove at once
            scrollThreshold: options.scrollThreshold || 0.05, // 5% threshold for triggering load
            cooldownTime: options.cooldownTime || 250 // Cooldown time in ms
        };

        this.setupScrollHandler();
    }

    // Toggle random mode on/off
    setRandomMode(enabled) {
        if (this.randomMode !== enabled) {
            this.randomMode = enabled;
            // Clear current songs and reset when toggling
            this.reset();
        }
    }
    
    // Reset the manager state
    reset() {
        this.songs = [];
        this.currentOffset = 0;
        this.hasMoreSongs = true;
        this.songIdSet.clear();
        // Fetch initial set of songs
        this.fetchMoreSongs('down');
    }

    setupScrollHandler() {
        let scrollTimeout;
        
        this.container.addEventListener('scroll', () => {
            if (!scrollTimeout) {
                scrollTimeout = setTimeout(() => {
                    this.handleScroll();
                    scrollTimeout = null;
                }, 150);
            }
        }, { passive: true });
    }

    handleScroll() {
        if (this.loadCooldown) return;

        const scrollTop = this.container.scrollTop;
        const scrollHeight = this.container.scrollHeight;
        const clientHeight = this.container.clientHeight;
        
        const scrolledFromTop = scrollTop / scrollHeight;
        const scrolledFromBottom = 1 - ((scrollTop + clientHeight) / scrollHeight);
        
        console.log('Scroll Debug:', {
            scrollTop,
            clientHeight,
            scrollHeight,
            totalSongs: this.songs.length,
            currentOffset: this.currentOffset,
            scrolledFromTop: (scrolledFromTop * 100).toFixed(4) + '%',
            scrolledFromBottom: (scrolledFromBottom * 100).toFixed(4) + '%',
            threshold: (this.config.scrollThreshold * 100).toFixed(4) + '%',
            randomMode: this.randomMode
        });

        if (scrolledFromBottom < this.config.scrollThreshold && !this.isLoading && this.hasMoreSongs) {
            this.fetchMoreSongs('down');
        } else if (scrolledFromTop < this.config.scrollThreshold && !this.isLoading && this.currentOffset > 0 && !this.randomMode) {
            // Only fetch previous songs in non-random mode
            this.fetchMoreSongs('up');
        }
    }

    async fetchMoreSongs(direction = 'down') {
        if (this.isLoading || this.loadCooldown || (!this.hasMoreSongs && direction === 'down')) return;
        
        try {
            this.isLoading = true;
            
            // In random mode, always get fresh random songs
            // In normal mode, use pagination offsets
            let fetchOffset = 0;
            if (!this.randomMode) {
                fetchOffset = direction === 'down' ? 
                    this.currentOffset + this.songs.length : 
                    Math.max(0, this.currentOffset - this.config.loadChunk);
            } else if (direction === 'up') {
                // In random mode, "up" doesn't make sense, so convert to "down"
                direction = 'down';
            }
            
            console.log(`Fetching songs from offset: ${fetchOffset}, direction: ${direction}, random: ${this.randomMode}`);
            
            // Save measurements BEFORE we make any changes
            // These are critical for maintaining exact scroll position
            const scrollingElement = window.musicPlayer.getCurrentScrollingElement();
            const oldScrollTop = scrollingElement.scrollTop;
            const oldHeight = scrollingElement.scrollHeight;
            const oldClientHeight = scrollingElement.clientHeight;
            
            // Get all currently visible song elements for precise anchoring
            const visibleSongCards = Array.from(scrollingElement.querySelectorAll('.song-card'));
            
            // Find the best anchor element - prioritize one that's fully visible
            const viewportTop = oldScrollTop;
            const viewportBottom = oldScrollTop + oldClientHeight;
            const viewportMiddle = viewportTop + (oldClientHeight / 2);
            
            // Find elements at specific positions in the viewport
            let anchorElements = [];
            for (const el of visibleSongCards) {
                const rect = el.getBoundingClientRect();
                const elTop = el.offsetTop;
                const elBottom = elTop + el.offsetHeight;
                
                // Record distance from middle of viewport for each element
                anchorElements.push({
                    element: el,
                    topOffset: elTop - viewportTop,
                    distanceFromMiddle: Math.abs((elTop + (el.offsetHeight/2)) - viewportMiddle)
                });
            }
            
            // Sort by distance from middle to find the most central element
            anchorElements.sort((a, b) => a.distanceFromMiddle - b.distanceFromMiddle);
            
            // Use the most central element as our primary anchor
            const primaryAnchor = anchorElements.length > 0 ? anchorElements[0] : null;
            
            // Fetch the new songs
            const url = `/api/songs?offset=${fetchOffset}&limit=${this.config.loadChunk}${this.randomMode ? '&random=true' : ''}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            this.totalSongsCount = data.total;
            this.hasMoreSongs = data.has_more;
            
            if (data.songs.length > 0) {
                let didModifyList = false;
                
                if (direction === 'down') {
                    // For random mode, we need extra duplicate checking
                    const newSongs = this.randomMode ? 
                        data.songs.filter(song => !this.songIdSet.has(song.id)) :
                        data.songs;
                    
                    if (this.songs.length >= this.config.totalSongs - this.config.loadChunk) {
                        // Important: ONLY remove songs if they're completely above the viewport
                        // to prevent visible content from changing
                        const indexToRemove = this.findSafeRemovalIndex(visibleSongCards, scrollingElement);
                        
                        if (indexToRemove > 0) {
                            // Remove songs from the beginning and update tracking
                            const removedSongs = this.songs.slice(0, indexToRemove);
                            removedSongs.forEach(song => {
                                // Only remove from set if the song doesn't appear elsewhere in the array
                                if (!this.songs.slice(indexToRemove).some(s => s.id === song.id)) {
                                    this.songIdSet.delete(song.id);
                                }
                            });
                            this.songs = this.songs.slice(indexToRemove);
                            if (!this.randomMode) {
                                this.currentOffset += indexToRemove;
                            }
                            didModifyList = true;
                        }
                    }
                    
                    // Add only new songs that aren't already in memory
                    if (newSongs.length > 0) {
                        newSongs.forEach(song => this.songIdSet.add(song.id));
                        this.songs = [...this.songs, ...newSongs];
                        didModifyList = true;
                    }
                } else {
                    // Non-random mode only - up direction
                    if (this.songs.length >= this.config.totalSongs - this.config.loadChunk) {
                        // Important: ONLY remove songs if they're completely below the viewport
                        const visibleBottom = oldScrollTop + oldClientHeight;
                        const lastVisibleCard = visibleSongCards[visibleSongCards.length - 1];
                        const lastVisibleIndex = lastVisibleCard ? 
                            this.songs.findIndex(s => s.id === lastVisibleCard.dataset.songId) : -1;
                        
                        if (lastVisibleIndex > 0 && lastVisibleIndex < this.songs.length - 1) {
                            // Remove songs from the end that are completely below viewport
                            const indexToKeep = lastVisibleIndex + Math.ceil(this.config.loadChunk / 2);
                            const removedSongs = this.songs.slice(indexToKeep);
                            removedSongs.forEach(song => {
                                // Only remove from set if the song doesn't appear elsewhere in the array
                                if (!this.songs.slice(0, indexToKeep).some(s => s.id === song.id)) {
                                    this.songIdSet.delete(song.id);
                                }
                            });
                            this.songs = this.songs.slice(0, indexToKeep);
                            didModifyList = true;
                        }
                    }
                    
                    // Add new songs to the start
                    if (data.songs.length > 0) {
                        data.songs.forEach(song => this.songIdSet.add(song.id));
                        this.songs = [...data.songs, ...this.songs];
                        this.currentOffset = fetchOffset;
                        didModifyList = true;
                    }
                }
                
                // Only redisplay songs if we actually modified the list
                if (didModifyList) {
                    // Update the display
                    this.displaySongs();
                    
                    // Restore scroll position with precise anchoring
                    this.maintainPreciseScrollPosition(
                        direction, 
                        scrollingElement,
                        oldScrollTop, 
                        primaryAnchor
                    );
                }
            } else if (direction === 'down') {
                // No more songs available
                this.hasMoreSongs = false;
            }
            
            // Add cooldown to prevent rapid repeated calls
            this.setCooldown();
            
        } catch (error) {
            console.error('Error fetching songs:', error);
        } finally {
            this.isLoading = false;
        }
    }
    
    // Find the index where we can safely remove songs (all elements above viewport)
    findSafeRemovalIndex(visibleElements, scrollingElement) {
        if (!visibleElements.length) return 0;
        
        // Find the first visible element
        const firstVisibleElement = visibleElements[0];
        const firstVisibleId = firstVisibleElement.dataset.songId;
        const firstVisibleIndex = this.songs.findIndex(s => s.id === firstVisibleId);
        
        if (firstVisibleIndex <= 0) return 0;
        
        // We'll remove elements up to a buffer before the first visible element
        // to ensure smooth scrolling experience
        const safeBufferCount = Math.min(5, firstVisibleIndex);
        return Math.max(0, firstVisibleIndex - safeBufferCount);
    }

    maintainPreciseScrollPosition(direction, scrollingElement, oldScrollTop, anchorInfo) {
        if (!scrollingElement) return;
        
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            if (anchorInfo && anchorInfo.element) {
                try {
                    // Find the element in the updated DOM
                    const songId = anchorInfo.element.dataset.songId;
                    const updatedElement = scrollingElement.querySelector(`.song-card[data-song-id="${songId}"]`);
                    
                    if (updatedElement) {
                        // Calculate new position based on the anchor's new position and original offset
                        const newScrollTop = updatedElement.offsetTop - anchorInfo.topOffset;
                        
                        // Set the scroll position precisely
                        scrollingElement.scrollTop = newScrollTop;
                        return;
                    }
                } catch (error) {
                    console.error('Error maintaining scroll position:', error);
                }
            }
            
            // Fallback - maintain original scroll position
            scrollingElement.scrollTop = oldScrollTop;
        });
    }

    displaySongs() {
        if (window.musicPlayer) {
            window.musicPlayer.displaySongs(this.songs);
        }
    }

    async loadSongsAroundIndex(index) {
        // IMPORTANT: This method is now disabled during song selection to prevent list jumps
        // It's only used for background loading of additional songs
        
        if (this.isLoading || window.musicPlayer?.ignoreNextDisplayCall) return;

        const startOffset = Math.max(0, index - this.config.loadChunk);
        
        try {
            this.isLoading = true;
            
            // Don't use random mode for specific index loading
            const response = await fetch(`/api/songs?offset=${startOffset}&limit=${this.config.loadChunk * 2 + 1}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            if (!this.totalSongsCount) this.totalSongsCount = data.total;

            // Store the songs in memory, but DON'T update the display
            // This is just for background loading without visual changes
            const existingSongIds = new Set(this.songs.map(s => s.id));
            data.songs.forEach(song => {
                if (!existingSongIds.has(song.id)) {
                    this.songIdSet.add(song.id);
                    // Add to the end of the list - don't reorder existing songs
                    this.songs.push(song);
                }
            });

            // IMPORTANT: Don't redisplay or change the UI in any way
            // This keeps the current list/view stable
            
            console.log(`Silently loaded ${data.songs.length} additional songs in memory around index ${index}`);
        } catch (error) {
            console.error('Error loading songs around index:', error);
        } finally {
            this.isLoading = false;
        }
    }

    filterSongs(searchTerm) {
        return this.songs.filter(song => 
            song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }

    /**
     * Load liked songs into memory
     * @param {Array} likedSongs - Array of liked song objects
     */
    loadLikedSongs(likedSongs) {
        if (!likedSongs || !Array.isArray(likedSongs) || likedSongs.length === 0) {
            console.log('No liked songs to load into memory');
            return;
        }
        
        console.log(`Loading ${likedSongs.length} liked songs into memory`);
        
        // Filter out songs that are already in memory
        const newSongs = likedSongs.filter(song => !this.songIdSet.has(song.id));
        
        if (newSongs.length === 0) {
            console.log('All liked songs are already in memory');
            return;
        }
        
        console.log(`Adding ${newSongs.length} new liked songs to memory`);
        
        // Track the IDs and add the songs
        newSongs.forEach(song => this.songIdSet.add(song.id));
        this.songs = [...this.songs, ...newSongs];
        
        // If we've gone over our limit, trim the least recently added songs
        // but avoid removing any liked songs we just added
        if (this.songs.length > this.config.totalSongs) {
            const excess = this.songs.length - this.config.totalSongs;
            const songsToRemove = this.songs.slice(0, excess);
            
            // Remove IDs that won't exist anywhere else in the array
            songsToRemove.forEach(song => {
                if (!this.songs.slice(excess).some(s => s.id === song.id)) {
                    this.songIdSet.delete(song.id);
                }
            });
            
            // Update the array
            this.songs = this.songs.slice(excess);
            this.currentOffset += excess;
        }
    }
    
    /**
     * Load playlist songs into memory
     * @param {Array} playlistSongs - Array of playlist song objects
     */
    loadPlaylistSongs(playlistSongs) {
        if (!playlistSongs || !Array.isArray(playlistSongs) || playlistSongs.length === 0) {
            console.log('No playlist songs to load into memory');
            return;
        }
        
        console.log(`Loading ${playlistSongs.length} playlist songs into memory`);
        
        // Filter out songs that are already in memory
        const newSongs = playlistSongs.filter(song => !this.songIdSet.has(song.id));
        
        if (newSongs.length === 0) {
            console.log('All playlist songs are already in memory');
            return;
        }
        
        console.log(`Adding ${newSongs.length} new playlist songs to memory`);
        
        // Track the IDs and add the songs
        newSongs.forEach(song => this.songIdSet.add(song.id));
        this.songs = [...this.songs, ...newSongs];
        
        // If we've gone over our limit, trim the least recently added songs
        // but avoid removing any playlist songs we just added
        if (this.songs.length > this.config.totalSongs) {
            const excess = this.songs.length - this.config.totalSongs;
            const songsToRemove = this.songs.slice(0, excess);
            
            // Remove IDs that won't exist anywhere else in the array
            songsToRemove.forEach(song => {
                if (!this.songs.slice(excess).some(s => s.id === song.id)) {
                    this.songIdSet.delete(song.id);
                }
            });
            
            // Update the array
            this.songs = this.songs.slice(excess);
            this.currentOffset += excess;
        }
    }
    
    /**
     * Find a song in memory by ID
     * @param {string} songId - ID of the song to find
     * @returns {Object|null} - Song object or null if not found
     */
    findSongById(songId) {
        if (!songId || !this.songIdSet.has(songId)) {
            return null;
        }
        
        return this.songs.find(song => song.id === songId) || null;
    }
    
    /**
     * Check if a song is already in memory
     * @param {string} songId - ID of the song to check
     * @returns {boolean} - True if song is in memory
     */
    hasSong(songId) {
        return this.songIdSet.has(songId);
    }
}

export default SongListManager; 