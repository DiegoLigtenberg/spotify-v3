import os
from dotenv import load_dotenv
from supabase import create_client
from collections import Counter, defaultdict

# Load environment variables
load_dotenv()

# Initialize Supabase client
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

def get_top_tags():
    """Analyze tags and their usage across songs."""
    print("Starting tag analysis...")
    
    # Get all songs with their titles
    songs_response = supabase.table('songs').select('id, title, artist').execute()
    songs = songs_response.data
    total_songs = len(songs)
    print(f"\nTotal songs in database: {total_songs}")
    
    # Create a mapping of song IDs to their info
    song_info = {song['id']: song for song in songs}
    
    # Get all tags with their names
    tags_response = supabase.table('tags').select('id, name').execute()
    tags = tags_response.data
    print(f"Total unique tags: {len(tags)}")
    print("\nFirst few tags in database:")
    for tag in tags[:5]:
        print(f"Tag ID: {tag['id']}, Name: {tag['name']}")
    
    # Get all song-tag relationships with a join to get tag names directly
    print("\nFetching song-tag relationships...")
    song_tags_response = supabase.from_('song_tags') \
        .select('song_id, tags(id, name)') \
        .execute()
    
    song_tags = song_tags_response.data
    print(f"Total tag assignments: {len(song_tags)}")
    print("\nFirst few song-tag relationships:")
    for relation in song_tags[:5]:
        print(f"Song ID: {relation['song_id']}, Tag: {relation.get('tags', {}).get('name', 'N/A')}")
    
    # Group tags by song
    song_to_tags = defaultdict(list)
    for relation in song_tags:
        if relation.get('tags') and relation['tags'].get('name'):
            song_id = relation['song_id']
            tag_name = relation['tags']['name']
            song_to_tags[song_id].append(tag_name)
    
    # Find songs with multiple tags
    multi_tag_songs = {song_id: tags for song_id, tags in song_to_tags.items() if len(tags) > 1}
    print(f"\nFound {len(multi_tag_songs)} songs with multiple tags")
    
    # Count tag usage
    tag_counts = Counter()
    songs_with_tags = set()
    
    for song_id, tags in song_to_tags.items():
        for tag in tags:
            tag_counts[tag] += 1
        songs_with_tags.add(song_id)
    
    # Calculate statistics
    songs_with_tags_count = len(songs_with_tags)
    tags_per_song = len(song_tags) / total_songs if total_songs > 0 else 0
    
    print(f"\nSongs with at least one tag: {songs_with_tags_count} ({(songs_with_tags_count/total_songs*100):.1f}%)")
    print(f"Average tags per song: {tags_per_song:.1f}")
    
    # Print example songs with their tags
    print("\nExample songs with tags:")
    
    # Find a song with exactly one tag
    one_tag_example = None
    for song_id, tags in song_to_tags.items():
        if len(tags) == 1 and song_id in song_info:
            one_tag_example = (song_id, song_info[song_id], tags)
            break
    
    if one_tag_example:
        song_id, song, tags = one_tag_example
        print(f"\nSong with one tag:")
        print(f"Title: {song['title']}")
        print(f"Artist: {song['artist']}")
        print(f"Tag: {tags[0]}")
    
    # Print all songs with multiple tags
    print("\nAll songs with multiple tags:")
    for song_id, tags in multi_tag_songs.items():
        if song_id in song_info:
            song = song_info[song_id]
            print(f"\nTitle: {song['title']}")
            print(f"Artist: {song['artist']}")
            print(f"Tags: {', '.join(tags)}")
    
    # Get and print top 10 most used tags
    print("\nTop 10 most used tags:")
    for tag_name, count in tag_counts.most_common(10):
        print(f"{tag_name}: {count} songs")
    
    return tag_counts.most_common(10)

if __name__ == "__main__":
    get_top_tags() 