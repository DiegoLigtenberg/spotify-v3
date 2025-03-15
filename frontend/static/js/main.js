import AudioPlayer from './modules/AudioPlayer.js';
import SongListManager from './modules/SongListManager.js';
import UIManager from './modules/UIManager.js';

class MusicPlayer {
    constructor() {
        this.currentSong = null;
        this.currentSongIndex = -1;
        
        this.audioPlayer = new AudioPlayer();
        this.uiManager = new UIManager();
        this.songListManager = new SongListManager(
            document.querySelector('.songs-container'),
            {
                totalSongs: 70,
                visibleSongs: 30,
                loadChunk: 20,
                scrollThreshold: 0.05,
                cooldownTime: 250
            }
        );

        this.setupEventListeners();
        this.initializeApplication();
    }

    setupEventListeners() {
        // Audio player events
        this.audioPlayer.addEventListener('timeupdate', () => {
            this.uiManager.updateProgress(
                this.audioPlayer.currentTime,
                this.audioPlayer.duration
            );
        });

        this.audioPlayer.addEventListener('ended', () => {
            if (this.currentSongIndex < this.songListManager.songs.length - 1) {
                this.playSong(this.songListManager.songs[this.currentSongIndex + 1]);
            }
        });

        this.audioPlayer.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            alert('Error playing the song. Please try again.');
        });

        // UI event handlers
        this.uiManager.onPlayPauseClick = () => this.handlePlayPause();
        this.uiManager.onPreviousClick = () => this.playPrevious();
        this.uiManager.onNextClick = () => this.playNext();
        this.uiManager.onProgressClick = (position) => {
            if (!this.currentSong || !this.audioPlayer.duration) return;
            this.audioPlayer.currentTime = position * this.audioPlayer.duration;
        };
        this.uiManager.onVolumeChange = (volume) => {
            this.audioPlayer.volume = volume;
            this.uiManager.updateVolume(volume);
        };
        this.uiManager.onSearch = (searchTerm) => {
            const filteredSongs = this.songListManager.filterSongs(searchTerm);
            this.displaySongs(filteredSongs);
        };

        // Override SongListManager's displaySongs method
        this.songListManager.displaySongs = () => {
            this.displaySongs(this.songListManager.songs);
        };
    }

    async initializeApplication() {
        try {
            await this.songListManager.fetchMoreSongs('down');
        } catch (error) {
            console.error('Error initializing application:', error);
            alert('Error loading songs. Please refresh the page.');
        }
    }

    displaySongs(songs) {
        const container = document.querySelector('.songs-container');
        container.innerHTML = '';
        
        songs.forEach(song => {
            const songElement = this.uiManager.createSongElement(
                song,
                this.currentSong && song.id === this.currentSong.id
            );
            songElement.addEventListener('click', () => this.playSong(song));
            container.appendChild(songElement);
        });
    }

    async playSong(song) {
        try {
            if (this.currentSong && this.currentSong.id === song.id && !this.audioPlayer.paused) {
                this.audioPlayer.pause();
                this.uiManager.updatePlayPauseButton(false);
                return;
            }

            this.currentSong = song;
            this.currentSongIndex = this.songListManager.songs.findIndex(s => s.id === song.id);
            
            const streamUrl = `/api/stream/${song.id}`;
            await this.audioPlayer.play(streamUrl);
            
            this.uiManager.updatePlayPauseButton(true);
            this.uiManager.updateCurrentSong(song);
            
            // Load songs around current song
            await this.songListManager.loadSongsAroundIndex(this.currentSongIndex);
            
        } catch (error) {
            console.error('Error in playSong:', error);
            this.uiManager.updatePlayPauseButton(false);
            if (error.name === 'NotSupportedError') {
                alert('This audio format is not supported by your browser.');
            } else if (error.name === 'NotAllowedError') {
                alert('Playback was prevented by your browser. Please try again.');
            } else {
                alert('Error playing the song. Please try again.');
            }
        }
    }

    handlePlayPause() {
        if (!this.currentSong) return;
        
        if (this.audioPlayer.paused) {
            this.audioPlayer.play()
                .then(() => this.uiManager.updatePlayPauseButton(true))
                .catch(error => {
                    console.error('Error playing song:', error);
                    this.uiManager.updatePlayPauseButton(false);
                });
        } else {
            this.audioPlayer.pause();
            this.uiManager.updatePlayPauseButton(false);
        }
    }

    playPrevious() {
        if (this.currentSongIndex > 0) {
            this.playSong(this.songListManager.songs[this.currentSongIndex - 1]);
        }
    }

    playNext() {
        if (this.currentSongIndex < this.songListManager.songs.length - 1) {
            this.playSong(this.songListManager.songs[this.currentSongIndex + 1]);
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
}); 