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
            threshold: (this.config.scrollThreshold * 100).toFixed(4) + '%'
        });

        if (scrolledFromBottom < this.config.scrollThreshold && !this.isLoading && this.hasMoreSongs) {
            this.fetchMoreSongs('down');
        } else if (scrolledFromTop < this.config.scrollThreshold && !this.isLoading && this.currentOffset > 0) {
            this.fetchMoreSongs('up');
        }
    }

    async fetchMoreSongs(direction = 'down') {
        if (this.isLoading || this.loadCooldown || (!this.hasMoreSongs && direction === 'down')) return;
        
        try {
            this.isLoading = true;
            const fetchOffset = direction === 'down' ? 
                this.currentOffset + this.songs.length : 
                Math.max(0, this.currentOffset - this.config.loadChunk);
            
            console.log(`Fetching songs from offset: ${fetchOffset}, direction: ${direction}, current songs: ${this.songs.length}`);
            
            const response = await fetch(`/api/songs?offset=${fetchOffset}&limit=${this.config.loadChunk}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            this.totalSongsCount = data.total;
            this.hasMoreSongs = data.has_more;
            
            if (data.songs.length > 0) {
                const oldScrollTop = this.container.scrollTop;
                const oldHeight = this.container.scrollHeight;
                
                if (direction === 'down') {
                    if (this.songs.length >= this.config.totalSongs - this.config.loadChunk) {
                        // Remove songs from the beginning and update tracking
                        const removedSongs = this.songs.slice(0, this.config.loadChunk);
                        removedSongs.forEach(song => {
                            // Only remove from set if the song doesn't appear elsewhere in the array
                            if (!this.songs.slice(this.config.loadChunk).some(s => s.id === song.id)) {
                                this.songIdSet.delete(song.id);
                            }
                        });
                        this.songs = this.songs.slice(this.config.loadChunk);
                        this.currentOffset += this.config.loadChunk;
                    }
                    
                    // Add only new songs that aren't already in memory
                    const newSongs = data.songs.filter(song => !this.songIdSet.has(song.id));
                    newSongs.forEach(song => this.songIdSet.add(song.id));
                    this.songs = [...this.songs, ...newSongs];
                } else {
                    if (this.songs.length >= this.config.totalSongs - this.config.loadChunk) {
                        // Remove songs from the end and update tracking
                        const removedSongs = this.songs.slice(-this.config.loadChunk);
                        removedSongs.forEach(song => {
                            // Only remove from set if the song doesn't appear elsewhere in the array
                            if (!this.songs.slice(0, -this.config.loadChunk).some(s => s.id === song.id)) {
                                this.songIdSet.delete(song.id);
                            }
                        });
                        this.songs = this.songs.slice(0, -this.config.loadChunk);
                    }
                    
                    // Add only new songs that aren't already in memory
                    const newSongs = data.songs.filter(song => !this.songIdSet.has(song.id));
                    newSongs.forEach(song => this.songIdSet.add(song.id));
                    this.songs = [...newSongs, ...this.songs];
                    this.currentOffset = fetchOffset;
                }
                
                this.displaySongs();
                this.maintainScrollPosition(direction, oldScrollTop, oldHeight);
                this.setCooldown();
            }
            
        } catch (error) {
            console.error('Error fetching songs:', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    displaySongs() {
        // This method should be overridden by the main application
        console.warn('displaySongs method not implemented');
    }

    maintainScrollPosition(direction, oldScrollTop, oldHeight) {
        const newHeight = this.container.scrollHeight;
        if (direction === 'up') {
            const heightDiff = newHeight - oldHeight;
            this.container.scrollTop = oldScrollTop + heightDiff;
        } else {
            this.container.scrollTop = oldScrollTop;
        }
    }

    setCooldown() {
        this.loadCooldown = true;
        setTimeout(() => {
            this.loadCooldown = false;
        }, this.config.cooldownTime);
    }

    async loadSongsAroundIndex(index) {
        if (this.isLoading) return;

        const startOffset = Math.max(0, index - this.config.loadChunk);
        
        try {
            this.isLoading = true;
            const response = await fetch(`/api/songs?offset=${startOffset}&limit=${this.config.loadChunk * 2 + 1}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            if (!this.totalSongsCount) this.totalSongsCount = data.total;

            const existingSongIds = new Set(this.songs.map(s => s.id));
            data.songs.forEach(song => {
                if (!existingSongIds.has(song.id)) {
                    this.songs.push(song);
                }
            });

            if (this.songs.length > this.config.visibleSongs) {
                const start = Math.max(0, index - Math.floor(this.config.visibleSongs / 2));
                this.songs = this.songs.slice(start, start + this.config.visibleSongs);
            }

            this.displaySongs();
        } catch (error) {
            console.error('Error loading songs around index:', error);
            throw error;
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