class SongListManager {
    constructor(container, options = {}) {
        // Get the container
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        if (!this.container) {
            console.error('SongListManager: No container element found');
            return;
        }
        
        // Default configuration
        this.config = {
            batchSize: options.batchSize || 20,
            scrollThreshold: options.scrollThreshold || 300,
            bufferSize: options.bufferSize || 100
        };
        
        // State
        this.songs = [];
        this.songIdSet = new Set();
        this.currentOffset = 0;
        this.hasMoreSongs = true;
        this.isLoading = false;
        this.randomMode = false;
        this.totalSongsCount = 0;
        this.currentTag = null;
        this.scrollDirection = 'down';
        this.lastScrollHeight = 0;
        
        // Detect iOS for special handling
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        // Initial render
        this._renderSongs();
        
        // Set up scroll handler
        this._initScrollHandler();
        
        console.log('SongListManager initialized', this.isIOS ? 'for iOS' : 'for standard browser');
    }

    _initScrollHandler() {
        // Determine the correct scroll container
        const scrollContainer = this._getScrollContainer();
        
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', this._handleScroll.bind(this), { passive: true });
            console.log(`Scroll listener attached to ${scrollContainer.tagName}.${scrollContainer.className}`);
        } else {
            console.error('Could not find a valid scroll container');
        }
        
        // Use IntersectionObserver for more reliable infinite scrolling, especially on iOS
        this._setupInfiniteScrollObserver();
    }

    _getScrollContainer() {
        // For iOS, use the active view container or home view
        if (this.isIOS) {
            return document.querySelector('.view-container.active') || 
                   document.getElementById('home-view');
        }
        
        // For other browsers, use the original container
        return this.container;
    }

    _setupInfiniteScrollObserver() {
        try {
            // Create or locate a sentinel element for infinite scrolling
            let sentinel = document.getElementById('infinite-scroll-sentinel');
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.id = 'infinite-scroll-sentinel';
                sentinel.className = 'infinite-scroll-sentinel';
                sentinel.style.height = '50px';
                sentinel.style.width = '100%';
                sentinel.style.marginTop = '20px';
                
                // Insert the sentinel at the end of the container or at the end of the active view
                const targetContainer = this.isIOS ? 
                    (document.querySelector('.songs-container')) : 
                    this.container;
                    
                if (targetContainer) {
                    targetContainer.appendChild(sentinel);
                    console.log('Created infinite scroll sentinel');
                }
            }
            
            if (sentinel) {
                // Create an observer instance
                const scrollRoot = this._getScrollContainer();
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        // When sentinel is visible
                        if (entry.isIntersecting && !this.isLoading && this.hasMoreSongs) {
                            console.log('Sentinel visible, loading more songs');
                            this._loadMoreSongs('down');
                        }
                    });
                }, {
                    root: this.isIOS ? scrollRoot : null,
                    rootMargin: '200px',
                    threshold: 0.1
                });
                
                // Start observing the sentinel
                observer.observe(sentinel);
                console.log('IntersectionObserver started for infinite scrolling');
            }
        } catch (error) {
            console.error('Error setting up infinite scroll observer:', error);
        }
    }

    _handleScroll(event) {
        // Get the real scrolling element
        const scrollContainer = this._getScrollContainer();
        if (!scrollContainer) return;
        
        // Get scroll info
        const scrollTop = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight;
        const clientHeight = scrollContainer.clientHeight;
        
        // Determine scroll direction
        if (this.lastScrollTop !== undefined) {
            this.scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
        }
        this.lastScrollTop = scrollTop;
        
        // Check if near the bottom
        const scrolledFromBottom = scrollHeight - scrollTop - clientHeight;
        
        // Debug log for iOS
        if (this.isIOS && scrolledFromBottom < 500) {
            console.log(`iOS Scroll: ${scrolledFromBottom}px from bottom, threshold: ${this.config.scrollThreshold}px`);
        }
        
        // Load more songs when we're near the bottom
        // Note: This is a backup for the IntersectionObserver, but we still keep it for browsers without IO support
        if (scrolledFromBottom < this.config.scrollThreshold && this.hasMoreSongs && !this.isLoading) {
            console.log('Scroll threshold reached, loading more songs');
            this._loadMoreSongs('down');
        }
    }

    async _loadMoreSongs(direction) {
        if (this.isLoading || (direction === 'down' && !this.hasMoreSongs)) return;
        
        this.isLoading = true;
        console.log(`Loading more songs (${direction}), current count: ${this.songs.length}`);
        
        try {
            // Store current scroll position and height
            const scrollContainer = this._getScrollContainer();
            const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
            this.lastScrollHeight = scrollContainer ? scrollContainer.scrollHeight : 0;
            
            // Calculate the offset for the next batch
            const fetchOffset = direction === 'down' 
                ? this.currentOffset + this.songs.length 
                : Math.max(0, this.currentOffset - this.config.batchSize);
            
            // Fetch new songs
            let url = `/api/songs?offset=${fetchOffset}&limit=${this.config.batchSize}${this.randomMode ? '&random=true' : ''}`;
            
            // Add tag parameter if set
            if (this.currentTag) {
                url += `&tag=${encodeURIComponent(this.currentTag)}`;
            }
            
            console.log(`Fetching songs: ${url}`);
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            this.totalSongsCount = data.total;
            this.hasMoreSongs = data.has_more;
            
            console.log(`Fetched ${data.songs.length} songs, more available: ${data.has_more}`);
            
            if (data.songs.length === 0) {
                if (direction === 'down') this.hasMoreSongs = false;
                return;
            }
            
            // Process new songs
            this._processSongBatch(data.songs, direction, fetchOffset);
            
            // Render songs and maintain scroll position
            this._renderSongs();
            
            // Wait for the DOM to update
            if (scrollContainer) {
                requestAnimationFrame(() => {
                    if (this.isIOS) {
                        // For iOS, use a more reliable approach with multiple attempts
                        const restoreScroll = () => {
                            this._maintainScrollPosition(scrollTop);
                        };
                        
                        restoreScroll();
                        setTimeout(restoreScroll, 50);
                        setTimeout(restoreScroll, 150);
                    } else {
                        this._maintainScrollPosition(scrollTop);
                    }
                });
            }
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
        // Get the correct scrolling container for this platform
        const scrollContainer = this._getScrollContainer();
        if (!scrollContainer) return;
        
        // Calculate the new scroll position based on the height difference
        const newScrollHeight = scrollContainer.scrollHeight;
        const heightDiff = newScrollHeight - this.lastScrollHeight;
        
        // If we're loading more songs at the bottom, maintain the same distance from the bottom
        if (this.scrollDirection === 'down') {
            const distanceFromBottom = this.lastScrollHeight - oldScrollTop;
            scrollContainer.scrollTop = newScrollHeight - distanceFromBottom;
            console.log(`Maintaining scroll position: new top=${scrollContainer.scrollTop}, height diff=${heightDiff}`);
        } else {
            // If scrolling up, maintain the same scroll position
            scrollContainer.scrollTop = oldScrollTop + heightDiff;
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
    
    async setTag(tagName) {
        if (this.currentTag === tagName) return;
        
        console.log(`Setting tag filter to: ${tagName || 'none'}`);
        this.currentTag = tagName;
        this.reset();
        
        await this._loadMoreSongs('down');
    }
}

export default SongListManager; 