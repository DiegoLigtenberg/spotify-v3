import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm
from datetime import datetime
from fast.settings.directory_settings import *

# Load environment variables
env_path = Path(__file__).parent / '.env'
print(f"Loading environment from: {env_path}")
load_dotenv(env_path)

# Supabase configuration
supabase: Client = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_KEY", "")
)

def sanitize_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitize data before sending to Supabase."""
    sanitized = {}
    for key, value in data.items():
        if value is None:
            continue
        
        # Convert empty strings to None
        if isinstance(value, str) and not value.strip():
            continue
            
        # Ensure numeric fields are numbers
        if key in ['duration', 'view_count', 'like_count']:
            try:
                value = float(value) if key == 'duration' else int(value)
            except (TypeError, ValueError):
                continue
                
        # Ensure date field is properly formatted
        if key == 'release_date' and value:
            try:
                # Convert YYYYMMDD to YYYY-MM-DD
                value = f"{value[:4]}-{value[4:6]}-{value[6:8]}"
            except (IndexError, TypeError):
                continue
        
        # Truncate description if too long (Postgres text field typical limit)
        if key == 'description' and isinstance(value, str):
            value = value[:10000]  # Limit to 10000 characters
            
        # Ensure title is not too long
        if key == 'title' and isinstance(value, str):
            value = value[:500]  # Limit title to 500 characters
            
        # Ensure artist/album names are not too long
        if key in ['artist', 'album'] and isinstance(value, str):
            value = value[:255]  # Standard varchar length
        
        sanitized[key] = value
    
    return sanitized

async def insert_tags(tags: List[str]) -> Dict[str, int]:
    """Insert tags and return a mapping of tag names to their IDs."""
    tag_map = {}
    
    for tag in tags:
        if not tag or not isinstance(tag, str):  # Skip empty or non-string tags
            continue
            
        # Clean the tag name
        tag = tag.strip().lower()  # Normalize tags to lowercase
        if not tag:  # Skip if tag becomes empty after cleaning
            continue
            
        try:
            # First try to get existing tag
            result = supabase.table("tags").select("id").eq("name", tag).execute()
            if result.data:
                tag_map[tag] = result.data[0]["id"]
                continue
                
            # If tag doesn't exist, insert it
            result = supabase.table("tags").insert({"name": tag}).execute()
            tag_map[tag] = result.data[0]["id"]
        except Exception as e:
            if '"tags_name_key"' in str(e):  # It's just a duplicate tag
                # Try one more time to get the ID
                try:
                    result = supabase.table("tags").select("id").eq("name", tag).execute()
                    if result.data:
                        tag_map[tag] = result.data[0]["id"]
                except Exception:
                    pass  # Silently skip if we can't get the tag ID
            else:
                print(f"Error handling tag '{tag}': {str(e)}")
    
    return tag_map

def get_b2_url(bucket_name: str, file_path: str) -> str:
    """
    Construct the full B2 URL for a file.
    Format: https://{bucket_name}.s3.eu-central-003.backblazeb2.com/{file_path}
    Example: https://SpotifyCloneMP3.s3.eu-central-003.backblazeb2.com/audio/0169517.mp3
    """
    return f"https://{bucket_name}.s3.eu-central-003.backblazeb2.com/{file_path}"

async def upload_metadata_to_supabase(metadata_dir: Path, base_dir: Path, b2_bucket_name: str):
    """Upload metadata from JSON files to Supabase."""
    # Look for JSON files in the metadata directory
    metadata_files = list(metadata_dir.glob("*.json"))
    print(f"Found {len(metadata_files)} metadata files to process in {metadata_dir}")
    
    if not metadata_files:
        print("No metadata files found! Please check the directory path.")
        return
    
    # Track statistics
    stats = {
        "total": len(metadata_files),
        "processed": 0,
        "empty_files": 0,
        "json_decode_errors": 0,
        "missing_media": 0,
        "missing_fields": 0,
        "api_errors": 0,
        "successful": 0
    }
    
    # Test connection and table existence
    try:
        test_result = supabase.table("songs").select("id").limit(1).execute()
        print("Successfully connected to Supabase and verified 'songs' table exists")
    except Exception as e:
        print(f"Error connecting to Supabase or accessing 'songs' table: {str(e)}")
        return
    
    with tqdm(total=len(metadata_files), desc="Uploading metadata") as pbar:
        for metadata_file in metadata_files:
            try:
                # Read metadata JSON
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    file_content = f.read()
                    
                    # Debug empty files
                    if not file_content.strip():
                        print(f"Empty file (no content): {metadata_file.name}")
                        stats["empty_files"] += 1
                        pbar.update(1)
                        continue
                    
                    try:
                        metadata = json.loads(file_content)
                    except json.JSONDecodeError as e:
                        print(f"JSON decode error in {metadata_file.name}:")
                        print(f"Error details: {str(e)}")
                        print(f"File content: {file_content[:200]}...")  # Show first 200 chars
                        stats["json_decode_errors"] += 1
                        pbar.update(1)
                        continue
                
                # Skip empty metadata
                if not metadata:
                    print(f"Empty metadata (valid JSON but empty object) in: {metadata_file.name}")
                    stats["empty_files"] += 1
                    pbar.update(1)
                    continue
                
                # Extract the file number from the filename
                file_id = metadata_file.stem
                
                # Verify that the corresponding MP3 and webp files exist
                mp3_path = base_dir / "audio" / f"{file_id}.mp3"
                webp_path = base_dir / "thumbnails" / f"{file_id}.webp"
                
                if not mp3_path.exists() or not webp_path.exists():
                    print(f"Missing media for {file_id}:")
                    if not mp3_path.exists():
                        print(f"  - Missing MP3: {mp3_path}")
                    if not webp_path.exists():
                        print(f"  - Missing thumbnail: {webp_path}")
                    stats["missing_media"] += 1
                    pbar.update(1)
                    continue
                
                # Construct storage paths and full URLs for B2
                audio_filename = f"audio/{file_id}.mp3"
                thumbnail_filename = f"thumbnails/{file_id}.webp"
                
                # Store both the relative path and full URL
                storage_path = audio_filename
                thumbnail_path = thumbnail_filename
                storage_url = get_b2_url(b2_bucket_name, audio_filename)
                thumbnail_url = get_b2_url(b2_bucket_name, thumbnail_filename)
                
                # Prepare song data
                song_data = {
                    "id": file_id,
                    "title": metadata.get("title"),
                    "artist": metadata.get("uploader"),  # YouTube uploader as artist
                    "album": metadata.get("album"),
                    "duration": metadata.get("duration"),
                    "release_date": metadata.get("upload_date"),
                    "view_count": metadata.get("view_count"),
                    "like_count": metadata.get("like_count"),
                    "description": metadata.get("description"),
                    "source_url": metadata.get("webpage_url"),  # Original source URL
                    "youtube_url": metadata.get("url"),  # Direct YouTube URL
                    "storage_path": storage_path,
                    "thumbnail_path": thumbnail_path,
                    "storage_url": storage_url,
                    "thumbnail_url": thumbnail_url
                }
                
                # Sanitize the data
                song_data = sanitize_data(song_data)
                
                # Skip if required fields are missing
                required_fields = ["id", "title", "duration"]
                missing_fields = [field for field in required_fields if not song_data.get(field)]
                if missing_fields:
                    print(f"Missing required fields in {file_id}: {', '.join(missing_fields)}")
                    stats["missing_fields"] += 1
                    pbar.update(1)
                    continue
                
                try:
                    # Try to select the song first to see if it exists
                    existing = supabase.table("songs").select("id").eq("id", file_id).execute()
                    
                    # Insert or update song data
                    if not existing.data:
                        result = supabase.table("songs").insert(song_data).execute()
                    else:
                        result = supabase.table("songs").update(song_data).eq("id", file_id).execute()
                    
                    if not result.data:
                        raise Exception("No data returned from database operation")
                        
                    # Handle tags if present
                    if tags := metadata.get("tags"):
                        # Insert tags and get their IDs
                        tag_map = await insert_tags(tags)
                        
                        # Create song-tag relationships
                        for tag_name, tag_id in tag_map.items():
                            try:
                                supabase.table("song_tags").upsert({
                                    "song_id": file_id,
                                    "tag_id": tag_id
                                }).execute()
                            except Exception as e:
                                print(f"Error linking tag '{tag_name}' to song {file_id}: {str(e)}")
                    
                    stats["successful"] += 1
                    
                except Exception as e:
                    print(f"\nAPI error processing {metadata_file.name}:")
                    print(f"Error type: {type(e).__name__}")
                    print(f"Error details: {str(e)}")
                    if hasattr(e, 'response'):
                        print(f"Response status: {getattr(e.response, 'status_code', 'unknown')}")
                        print(f"Response body: {getattr(e.response, 'text', 'no response body')}")
                    print(f"Attempted data: {json.dumps(song_data, indent=2)}")
                    stats["api_errors"] += 1
                
                pbar.update(1)
                
            except Exception as e:
                print(f"\nUnexpected error processing {metadata_file.name}:")
                print(f"Error type: {type(e).__name__}")
                print(f"Error details: {str(e)}")
                pbar.update(1)
                continue
    
    # Print final statistics
    print("\nProcessing completed. Statistics:")
    print(f"Total files: {stats['total']}")
    print(f"Successfully processed: {stats['successful']}")
    print(f"Empty files: {stats['empty_files']}")
    print(f"JSON decode errors: {stats['json_decode_errors']}")
    print(f"Missing media files: {stats['missing_media']}")
    print(f"Missing required fields: {stats['missing_fields']}")
    print(f"API errors: {stats['api_errors']}")

def main():
    # Check for required environment variables
    required_vars = ["SUPABASE_URL", "SUPABASE_KEY", "B2_BUCKET_NAME"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print("Error: Missing required environment variables:")
        for var in missing_vars:
            print(f"- {var}")
        return
    
    # Define directories
    metadata_dir = Path("G:/Github/audio-foundation/database/dataset_mp3_metadata")
    base_dir = Path("G:/Github/audio-foundation/database/dataset_mp3")  # Updated path
    
    # Verify directories exist
    if not metadata_dir.exists():
        print(f"Error: Metadata directory not found: {metadata_dir}")
        return
    
    if not base_dir.exists():
        print(f"Error: Media directory not found: {base_dir}")
        return
        
    # Check for audio and thumbnails subdirectories
    audio_dir = base_dir / "audio"
    thumbnails_dir = base_dir / "thumbnails"
    
    if not audio_dir.exists():
        print(f"Error: Audio directory not found: {audio_dir}")
        return
        
    if not thumbnails_dir.exists():
        print(f"Error: Thumbnails directory not found: {thumbnails_dir}")
        return
    
    # Print the directories we're going to process
    print(f"Processing metadata from directory: {metadata_dir}")
    print(f"Looking for media files in: {base_dir}")
    print(f"  - Audio files in: {audio_dir}")
    print(f"  - Thumbnails in: {thumbnails_dir}")
    
    # Run the upload process
    asyncio.run(upload_metadata_to_supabase(
        metadata_dir=metadata_dir,
        base_dir=base_dir,
        b2_bucket_name=os.getenv("B2_BUCKET_NAME")
    ))

if __name__ == "__main__":
    main() 