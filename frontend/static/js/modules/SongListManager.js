class SongListManager {
    constructor(container, options = {}) {
        this.container = container;
        this.songs = [];
        this.currentOffset = 0;
        this.hasMoreSongs = true;
        this.isLoading = false;
        this.totalSongsCount = 0;
        this.songIdSet = new Set();
        this.randomMode = options.randomMode || false;
        
        // Configuration
        this.config = {
            // Keep more songs in memory for smoother scrolling
            bufferSize: options.bufferSize || 100,
            // Load more songs at once to reduce loading frequency
            batchSize: options.batchSize || 30,
            // Start loading more songs when we're 30% from the bottom
            scrollThreshold: options.scrollThreshold || 0.3,
            // Debounce scroll events
            scrollCooldown: options.scrollCooldown || 100
        };

        this.lastScrollTop = 0;
        this.scrollTimeout = null;
        this.scrollDirection = 'down';
        this.isScrolling = false;
        this.lastScrollHeight = 0;
        
        // Initialize scroll handler
        this._initScrollHandler();
    }

    _initScrollHandler() {
        this.container.addEventListener('scroll', () => {
            if (this.scrollTimeout) {
                clearTimeout(this.scrollTimeout);
            }
            
            this.scrollTimeout = setTimeout(() => {
                this._handleScroll();
                this.scrollTimeout = null;
            }, this.config.scrollCooldown);
        }, { passive: true });
    }

    _handleScroll() {
        if (this.isLoading) return;

        const scrollTop = this.container.scrollTop;
        const scrollHeight = this.container.scrollHeight;
        const clientHeight = this.container.clientHeight;
        
        this.scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
        this.lastScrollTop = scrollTop;
        
        // Calculate how far we've scrolled from the bottom
        const scrolledFromBottom = 1 - ((scrollTop + clientHeight) / scrollHeight);
        
        // Load more songs when we're near the bottom
        if (scrolledFromBottom < this.config.scrollThreshold && this.hasMoreSongs) {
            this._loadMoreSongs('down');
        }
    }

    async _loadMoreSongs(direction) {
        if (this.isLoading || (direction === 'down' && !this.hasMoreSongs)) return;
        
        this.isLoading = true;
        
        try {
            // Store current scroll position and height
            const scrollTop = this.container.scrollTop;
            this.lastScrollHeight = this.container.scrollHeight;
            
            // Calculate the offset for the next batch
            const fetchOffset = direction === 'down' 
                ? this.currentOffset + this.songs.length 
                : Math.max(0, this.currentOffset - this.config.batchSize);
            
            // Fetch new songs
            const url = `/api/songs?offset=${fetchOffset}&limit=${this.config.batchSize}${this.randomMode ? '&random=true' : ''}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            this.totalSongsCount = data.total;
            this.hasMoreSongs = data.has_more;
            
            if (data.songs.length === 0) {
                if (direction === 'down') this.hasMoreSongs = false;
                return;
            }
            
            // Process new songs
            this._processSongBatch(data.songs, direction, fetchOffset);
            
            // Render songs and maintain scroll position
            this._renderSongs();
            
            // Wait for the DOM to update
            requestAnimationFrame(() => {
                this._maintainScrollPosition(scrollTop);
            });
        } catch (error) {
            console.error('Error loading songs:', error);
        } finally {
            this.isLoading = false;
        }
    }
    
    _processSongBatch(newSongs, direction, fetchOffset) {
        if (direction === 'down') {
            // Filter out duplicates in random mode
            const uniqueNewSongs = this.randomMode 
                ? newSongs.filter(song => !this.songIdSet.has(song.id))
                : newSongs;
                
            uniqueNewSongs.forEach(song => this.songIdSet.add(song.id));
            this.songs = [...this.songs, ...uniqueNewSongs];
        } else {
            newSongs.forEach(song => this.songIdSet.add(song.id));
            this.songs = [...newSongs, ...this.songs];
            this.currentOffset = fetchOffset;
        }
        
        // Only trim if we have too many songs
        if (this.songs.length > this.config.bufferSize * 2) {
            this._trimSongList();
        }
    }
    
    _trimSongList() {
        // Keep only the most recent songs
        const keepCount = this.config.bufferSize;
        const removedSongs = this.songs.slice(0, this.songs.length - keepCount);
        
        // Update the song set
        removedSongs.forEach(song => {
            if (!this.songs.slice(-keepCount).some(s => s.id === song.id)) {
                this.songIdSet.delete(song.id);
            }
        });
        
        // Update the songs array and offset
        this.songs = this.songs.slice(-keepCount);
        if (!this.randomMode) {
            this.currentOffset += this.songs.length - keepCount;
        }
    }
    
    _maintainScrollPosition(oldScrollTop) {
        // Calculate the new scroll position based on the height difference
        const newScrollHeight = this.container.scrollHeight;
        const heightDiff = newScrollHeight - this.lastScrollHeight;
        
        // If we're loading more songs at the bottom, maintain the same distance from the bottom
        if (this.scrollDirection === 'down') {
            const distanceFromBottom = this.lastScrollHeight - oldScrollTop;
            this.container.scrollTop = newScrollHeight - distanceFromBottom;
        } else {
            // If scrolling up, maintain the same scroll position
            this.container.scrollTop = oldScrollTop + heightDiff;
        }
        
        // Update the last scroll height
        this.lastScrollHeight = newScrollHeight;
    }
    
    _renderSongs() {
        if (window.musicPlayer) {
            window.musicPlayer.displaySongs(this.songs);
        }
    }
    
    reset() {
        this.songs = [];
        this.currentOffset = 0;
        this.hasMoreSongs = true;
        this.isLoading = false;
        this.totalSongsCount = 0;
        this.songIdSet.clear();
        this._renderSongs();
    }
    
    setRandomMode(enabled) {
        this.randomMode = enabled;
        this.reset();
    }
    
    loadLikedSongs(likedSongs) {
        this.songs = likedSongs;
        this.songIdSet = new Set(likedSongs.map(song => song.id));
        this.hasMoreSongs = false;
        this._renderSongs();
    }
    
    loadPlaylistSongs(playlistSongs) {
        this.songs = playlistSongs;
        this.songIdSet = new Set(playlistSongs.map(song => song.id));
        this.hasMoreSongs = false;
        this._renderSongs();
    }
    
    findSongById(songId) {
        return this.songs.find(song => song.id === songId);
    }
    
    hasSong(songId) {
        return this.songIdSet.has(songId);
    }
    
    filterSongs(searchTerm) {
        if (!searchTerm) return this.songs;
        
        const term = searchTerm.toLowerCase();
        return this.songs.filter(song => 
            song.title.toLowerCase().includes(term) || 
            song.artist.toLowerCase().includes(term)
        );
    }
}

export default SongListManager; 