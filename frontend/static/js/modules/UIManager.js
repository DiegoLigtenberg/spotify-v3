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

        // Progress bar click handler
        this.elements.progress.addEventListener('click', (e) => {
            if (this.onProgressClick) {
                const rect = this.elements.progress.getBoundingClientRect();
                const clickPosition = (e.clientX - rect.left) / rect.width;
                const normalizedPosition = Math.max(0, Math.min(1, clickPosition));
                this.onProgressClick(normalizedPosition);
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

    updatePlayPauseButton(isPlaying) {
        this.elements.playPauseButton.innerHTML = isPlaying ? 
            '<i class="fas fa-pause"></i>' : 
            '<i class="fas fa-play"></i>';
    }

    updateProgress(currentTime, duration) {
        if (isNaN(currentTime) || isNaN(duration)) return;
        
        const progressPercent = (currentTime / duration) * 100;
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
}

export default UIManager; 