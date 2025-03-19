-- Songs table - main table for song metadata
CREATE TABLE IF NOT EXISTS public.songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    duration FLOAT NOT NULL,
    release_date DATE,
    view_count BIGINT,
    like_count BIGINT,
    description TEXT,
    source_url TEXT,  -- Source URL (e.g., YouTube video URL)
    youtube_url TEXT, -- Direct YouTube URL
    storage_path TEXT NOT NULL,  -- Relative path in B2 (e.g., "audio/0169512.mp3")
    thumbnail_path TEXT NOT NULL,  -- Relative path in B2 (e.g., "thumbnails/0169512.png")
    storage_url TEXT NOT NULL,  -- Full B2 URL for audio
    thumbnail_url TEXT NOT NULL,  -- Full B2 URL for thumbnail
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tags table - for storing unique tags
CREATE TABLE IF NOT EXISTS public.tags (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- Song tags junction table - for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.song_tags (
    song_id TEXT REFERENCES public.songs(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, tag_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_songs_title ON public.songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON public.songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_album ON public.songs(album);
CREATE INDEX IF NOT EXISTS idx_songs_release_date ON public.songs(release_date);
CREATE INDEX IF NOT EXISTS idx_songs_youtube_url ON public.songs(youtube_url);
CREATE INDEX IF NOT EXISTS idx_songs_source_url ON public.songs(source_url);
CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags(name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at timestamp (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_songs_updated_at'
    ) THEN
        CREATE TRIGGER update_songs_updated_at
            BEFORE UPDATE ON public.songs
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END
$$; 