import os
import json
import base64
import hashlib
import logging
import argparse
import time
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Set
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm
from datetime import datetime

# Load environment variables
env_path = Path(__file__).parent / '.env'
print(f"Loading environment from: {env_path}")
load_dotenv(env_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("upload_to_supabase.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Adjust logger levels - only show warnings or higher to console during processing
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.WARNING)
file_handler = logging.FileHandler("upload_to_supabase.log")
file_handler.setLevel(logging.INFO)

# Replace existing handlers
logger.handlers = []
logger.addHandler(console_handler)
logger.addHandler(file_handler)
logger.setLevel(logging.INFO)

# Supabase configuration
supabase: Client = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_KEY", "")
)

# Constants
BATCH_SIZE = 50
MAXIMUM_RETRIES = 3
RETRY_DELAY = 5  # seconds
INDEX_FILE = "supabase_upload_index.json"

def format_timestamp(dt: Optional[datetime] = None) -> str:
    """Format timestamp in PostgreSQL-compatible ISO format."""
    if dt is None:
        dt = datetime.utcnow()
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def get_b2_url(file_id: str, file_type: str) -> str:
    """
    Generate a URL for a file in the B2 bucket.
    
    Args:
        file_id: The ID of the file
        file_type: The type of file (audio or thumbnail)
        
    Returns:
        The URL to the file
    """
    if file_type == "audio":
        extension = "mp3"
        path = "audio"
    else:
        extension = "png"
        path = "thumbnails"
    
    return f"https://spotifyclonemp3.s3.eu-central-003.backblazeb2.com/{path}/{file_id}.{extension}"

def format_date(date_str: str) -> str:
    """Convert YYYYMMDD string to YYYY-MM-DD format for PostgreSQL."""
    if not date_str or len(date_str) != 8:
        return None
    
    try:
        year = date_str[0:4]
        month = date_str[4:6]
        day = date_str[6:8]
        return f"{year}-{month}-{day}"
    except (IndexError, ValueError):
        logger.warning(f"Invalid date format: {date_str}")
        return None

def sanitize_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Clean up data before inserting into database."""
    # Create a mapping from metadata fields to DB columns
    field_mapping = {
        # General field mappings
        "file_path": "storage_path",
        "thumbnail_path": "thumbnail_path",
        
        # The database uses storage_url and thumbnail_url columns
        "audio_url": "storage_url",
        "thumbnail_url": "thumbnail_url",
        
        # Map source_url to youtube_url
        "source_url": "youtube_url",
    }
    
    # Convert metadata fields to DB column names
    mapped_data = {}
    for key, value in data.items():
        # Map the key if it exists in mapping, otherwise use the original key
        db_key = field_mapping.get(key, key)
        if value is not None:
            mapped_data[db_key] = value
    
    # Convert release_date from YYYYMMDD to YYYY-MM-DD
    if "release_date" in mapped_data and mapped_data["release_date"]:
        mapped_data["release_date"] = format_date(mapped_data["release_date"])
    
    # Get file ID
    file_id = data.get("id") or mapped_data.get("id")
    if not file_id and "file_path" in data:
        # Try to extract file ID from file path
        file_path = data["file_path"]
        file_id = Path(file_path).stem
    
    # Generate paths and URLs based on file ID
    if file_id:
        # Always set the storage path fields
        if "storage_path" not in mapped_data:
            mapped_data["storage_path"] = f"audio/{file_id}.mp3"
        
        if "thumbnail_path" not in mapped_data:
            mapped_data["thumbnail_path"] = f"thumbnails/{file_id}.png"
            
        # ALWAYS set the URLs, overriding any existing values
        mapped_data["storage_url"] = get_b2_url(file_id, "audio")
        mapped_data["thumbnail_url"] = get_b2_url(file_id, "thumbnail")
    
    # Remove any fields that don't exist in the schema
    valid_columns = {
        "id", "title", "artist", "album", "duration", "release_date", 
        "view_count", "like_count", "description", "youtube_url", 
        "youtube_id", "storage_path", "thumbnail_path", "storage_url", 
        "thumbnail_url", "created_at", "updated_at", "tags"
    }
    
    sanitized = {k: v for k, v in mapped_data.items() if k in valid_columns}
    
    # Final check to ensure required fields have values
    if "id" in sanitized and "storage_path" not in sanitized:
        sanitized["storage_path"] = f"audio/{sanitized['id']}.mp3"
    
    if "id" in sanitized and "thumbnail_path" not in sanitized:
        sanitized["thumbnail_path"] = f"thumbnails/{sanitized['id']}.png"
    
    # Ensure we have timestamp for updated_at
    if "updated_at" not in sanitized:
        sanitized["updated_at"] = format_timestamp()
    
    return sanitized

def insert_tags(supabase_client, song_id: str, tags: List[str]) -> None:
    """Insert tags for a song."""
    if not tags:
        return
    
    # First, make sure all tags exist in the tags table
    tag_objects = []
    for tag_name in tags:
        tag_name = tag_name.strip().lower()
        if not tag_name:
            continue
        tag_objects.append({"name": tag_name})
    
    if tag_objects:
        # Upsert tags to ensure they exist
        supabase_client.table("tags").upsert(
            tag_objects, 
            on_conflict="name"
        ).execute()
        
        # Get tag IDs for the inserted tag names
        tag_results = supabase_client.table("tags").select("id, name").in_("name", [obj["name"] for obj in tag_objects]).execute()
        
        # Create song_tags relationships
        song_tag_objects = []
        for tag_record in tag_results.data:
            song_tag_objects.append({
                "song_id": song_id,
                "tag_id": tag_record["id"]
            })
        
        if song_tag_objects:
            # First delete existing relationships
            supabase_client.table("song_tags").delete().eq("song_id", song_id).execute()
            
            # Then insert new relationships
            supabase_client.table("song_tags").insert(song_tag_objects).execute()

def calculate_file_hash(file_path: str) -> str:
    """Calculate MD5 hash of a file."""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def setup_versioning_tables(supabase_client) -> None:
    """Ensure the versioning tables exist in Supabase."""
    try:
        # Check if song_versions table exists by querying it
        supabase_client.table("song_versions").select("count", count="exact").limit(1).execute()
        logger.info("Versioning tables already exist")
    except Exception as e:
        if "relation" in str(e) and "does not exist" in str(e):
            # Create song_versions table using SQL through pgSQL function
            sql = """
            CREATE TABLE IF NOT EXISTS song_versions (
                version_id SERIAL PRIMARY KEY,
                song_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                file_hash TEXT,
                UNIQUE(song_id, version_number)
            );
            
            -- Index for faster queries
            CREATE INDEX IF NOT EXISTS idx_song_versions_song_id ON song_versions(song_id);
            """
            
            try:
                # In Supabase, we can use the "execute_sql" function that's built-in
                # instead of custom RPC functions
                result = supabase_client.postgrest.rpc('execute_sql', {'query': sql}).execute()
                logger.info("Created song_versions table in Supabase")
            except Exception as e2:
                # If that approach doesn't work, use a direct CREATE request
                logger.warning(f"Could not use RPC to create table: {e2}")
                logger.info("Attempting direct creation via REST API")
                
                # Try a simpler approach that doesn't rely on RPC
                supabase_client.table("song_versions").insert({
                    "version_id": 0,
                    "song_id": "test",
                    "version_number": 0,
                    "data": {},
                    "file_hash": "test"
                }).execute()
                
                logger.info("Successfully created song_versions table")
        else:
            # Other error
            logger.error(f"Error checking song_versions table: {e}")
            raise

def get_latest_version(supabase_client, song_id: str) -> Tuple[int, Optional[Dict]]:
    """Get the latest version number and data for a song."""
    try:
        result = supabase_client.table("song_versions") \
            .select("version_number, data, file_hash") \
            .eq("song_id", song_id) \
            .order("version_number", desc=True) \
            .limit(1) \
            .execute()
        
            if result.data:
            return result.data[0]["version_number"], result.data[0]
        return 0, None
    except Exception as e:
        logger.error(f"Error retrieving latest version for song {song_id}: {e}")
        return 0, None

def save_version(supabase_client, song_id: str, data: Dict[str, Any], file_hash: str) -> int:
    """Save a new version of a song."""
    try:
        # Get current version number
        current_version, current_version_record = get_latest_version(supabase_client, song_id)
        
        # First check for hash changes (faster check)
        if current_version_record and current_version_record.get("file_hash") == file_hash:
            # Even if hash is the same, we should check the actual content
            # This handles cases where hash collision occurs or when
            # hash remains the same but content actually changed
            
            # Get the current data from the version record
            current_data = current_version_record.get("data", {})
            
            # Compare important metadata fields
            metadata_fields = ["title", "artist", "album", "description", "youtube_url", "storage_url", "thumbnail_url"]
            content_changed = False
            
            for field in metadata_fields:
                # Check if the field exists in both and has different values
                if field in data and field in current_data and data[field] != current_data[field]:
                    # Use debug instead of info for URL-related changes to reduce terminal output
                    if field in ["storage_url", "thumbnail_url"]:
                        logger.debug(f"Detected change in '{field}' for song {song_id} despite same hash")
                    else:
                        logger.info(f"Detected change in '{field}' for song {song_id} despite same hash")
                    content_changed = True
                    break
                
                # Field exists in new data but not in current data
                if field in data and (field not in current_data or current_data[field] is None):
                    # Use debug instead of info for URL-related changes to reduce terminal output
                    if field in ["storage_url", "thumbnail_url"]:
                        logger.debug(f"Field '{field}' added for song {song_id}")
                    else:
                        logger.info(f"Field '{field}' added for song {song_id}")
                    content_changed = True
                    break
            
            # If content hasn't changed, skip creating a new version
            if not content_changed:
                logger.debug(f"No changes detected for song {song_id}, skipping version save")
                return current_version
        
        # Increment version
        new_version = current_version + 1
        
        # Save new version
        result = supabase_client.table("song_versions").insert({
            "song_id": song_id,
            "version_number": new_version,
            "data": data,
            "file_hash": file_hash,
            "created_at": format_timestamp()
        }).execute()
        
        # Log to file but not console to avoid cluttering the display
        logger.debug(f"Saved version {new_version} for song {song_id}")
        return new_version
    except Exception as e:
        logger.error(f"Error saving version for song {song_id}: {e}")
        return 0

def retry_api_call(func, *args, **kwargs):
    """Retry an API call with exponential backoff."""
    retries = 0
    last_error = None
    
    while retries < MAXIMUM_RETRIES:
        try:
            result = func(*args, **kwargs)
            return result
        except Exception as e:
            retries += 1
            last_error = e
            error_message = str(e)
            
            # Log different messages based on the error type
            if '"All object keys must match"' in error_message:
                logger.warning(f"API call failed due to mismatched object keys. Retrying ({retries}/{MAXIMUM_RETRIES})")
            else:
                logger.warning(f"API call failed, retrying ({retries}/{MAXIMUM_RETRIES}): {e}")
                
            if retries >= MAXIMUM_RETRIES:
                break
                
            time.sleep(RETRY_DELAY * (2 ** (retries - 1)))  # Exponential backoff
    
    # If we get here, all retries failed
    if last_error:
        raise last_error
    else:
        raise Exception("Maximum retries exceeded")

def load_file_index() -> Dict[str, Any]:
    """
    Load the file index for tracking processed files.
    
    Returns:
        Dictionary with file paths as keys and metadata as values
    """
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE, 'r') as f:
                index = json.load(f)
                return index
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Error loading index file: {e}")
            
    # Default structure if file doesn't exist or is invalid
    return {
        "files": {},
        "last_run": None
    }

def save_file_index(index: Dict[str, Any]):
    """
    Save the file index to disk.
    
    Args:
        index: The index data to save
    """
    # Update last run timestamp
    index["last_run"] = format_timestamp()
    
    try:
        with open(INDEX_FILE, 'w') as f:
            json.dump(index, f, indent=2)
    except IOError as e:
        logger.error(f"Error saving index file: {e}")

def update_file_index(index: Dict[str, Any], file_path: str, file_hash: str, success: bool = True):
    """
    Update the index entry for a processed file.
    
    Args:
        index: The index data structure
        file_path: Path to the file that was processed
        file_hash: Hash of the file content
        success: Whether processing was successful
    """
    if success:
        index["files"][file_path] = {
            "mtime": os.path.getmtime(file_path),
            "hash": file_hash,
            "processed_at": format_timestamp()
        }

def get_changed_files(metadata_dir: str, index: Dict[str, Any], force: bool = False) -> List[Path]:
    """
    Identify which files have changed since the last run.
    
    Args:
        metadata_dir: Directory containing metadata files
        index: The index data structure
        force: Whether to force processing of all files
        
    Returns:
        List of Path objects for files that need processing
    """
    metadata_path = Path(metadata_dir)
    json_files = list(metadata_path.glob("**/*.json"))
    
    if force:
        # If force is True, process all files
        return json_files
    
    # Get the indexed files
    indexed_files = index.get("files", {})
    
    # Filter files to only those that have changed
    files_to_process = []
    
    for file_path in json_files:
        str_path = str(file_path)
        file_info = indexed_files.get(str_path)
        
        # Process file if:
        # 1. It's not in the index
        # 2. Its modification time is newer than what's recorded
        # 3. Its size is zero (to re-check empty files in case they've been populated)
        if (not file_info or 
            os.path.getmtime(file_path) > file_info.get("mtime", 0) or
            os.path.getsize(file_path) == 0):
            files_to_process.append(file_path)
    
    return files_to_process

def upload_metadata_to_supabase(
    metadata_dir: str,
    base_dir: Optional[str] = None,
    b2_bucket_name: Optional[str] = None,
    incremental: bool = False,
    force: bool = False,
    batch_size: int = BATCH_SIZE,
    enable_versioning: bool = True,
    skip_media_check: bool = False,
    force_url_updates: bool = False
) -> Dict[str, int]:
    """
    Upload metadata to Supabase.
    
    Args:
        metadata_dir: Directory containing metadata JSON files
        base_dir: Base directory for media files (optional)
        b2_bucket_name: Backblaze B2 bucket name (optional)
        incremental: Only process new or changed files
        force: Force processing of all files regardless of history
        batch_size: Number of records to batch in a single request
        enable_versioning: Whether to save versioned copies of each record
        skip_media_check: Skip checking if media files exist
        force_url_updates: Force update of all URLs
        
    Returns:
        Statistics about the upload process
    """
    # Initialize Supabase client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    
    supabase_client = create_client(url, key)
    
    # Set up versioning tables if enabled
    if enable_versioning:
        setup_versioning_tables(supabase_client)
    
    # Statistics
    stats = {
        "total_files": 0,
        "processed_files": 0,
        "skipped_unchanged": 0,
        "skipped_indexed": 0,  # Files skipped because index showed they haven't changed
        "empty_files": 0,
        "json_decode_errors": 0,
        "missing_media": 0,
        "api_errors": 0,
        "batch_count": 0,
        "new_versions_created": 0,
        "metadata_changes": 0,  # Count files that had metadata changes with same hash
        "url_updates": 0,       # Count of URL updates
    }
    
    # Data quality tracking - count null values in each column
    null_value_counts = {
        "id": 0, "title": 0, "artist": 0, "album": 0, "duration": 0, 
        "release_date": 0, "view_count": 0, "like_count": 0, "description": 0, 
        "youtube_url": 0, "youtube_id": 0, "storage_path": 0, "thumbnail_path": 0, 
        "storage_url": 0, "thumbnail_url": 0
    }
    total_records = 0
    
    # Load the file index for incremental processing
    index = load_file_index() if incremental else {"files": {}}
    
    # Get list of files to process (all or only changed)
    if incremental and not force:
        json_files = get_changed_files(metadata_dir, index, force)
        all_files = list(Path(metadata_dir).glob("**/*.json"))
        stats["skipped_indexed"] = len(all_files) - len(json_files)
        logger.info(f"Using index to skip {stats['skipped_indexed']} unchanged files")
    else:
        json_files = list(Path(metadata_dir).glob("**/*.json"))
    
    stats["total_files"] = len(json_files)
    
    # Process files in batches
    batch_data = []
    batch_file_info = []  # Store file paths and hashes for versioning
    
    # Use tqdm for progress tracking with enhanced description
    # Disable logger output to console while tqdm is active
    original_level = console_handler.level
    console_handler.setLevel(logging.ERROR)
    
    # Initialize progress bar
    with tqdm(total=len(json_files), desc="Processing files", unit="files") as progress_bar:
        for idx, json_file in enumerate(json_files):
            song_id = json_file.stem  # Assuming filename is the song ID
            
            # Update progress bar with file info but keep it clean
            progress_bar.set_description(f"File {idx+1}/{len(json_files)}")
            progress_bar.set_postfix_str(f"{json_file.name}")
            
            try:
                # Calculate file hash for tracking
                file_hash = calculate_file_hash(json_file)
                
                # Read and parse the JSON file to check for content changes
                # We always need to read the file content to check for metadata changes
                if json_file.stat().st_size == 0:
                    logger.warning(f"Empty file: {json_file}")
                    stats["empty_files"] += 1
                    progress_bar.update(1)
                    continue
                    
                with open(json_file, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                
                # Process the metadata for inserting into Supabase
                record_data = sanitize_data(metadata)
                
                # Make sure we have an ID
                if "id" not in record_data:
                    record_data["id"] = song_id
                
                # For force URL updates, we want to process the file even if it's unchanged
                # But only check if we're not already forcing all processing
                if not force and force_url_updates and incremental and enable_versioning:
                    # Get the current record to see if URLs need updating
                    try:
                        result = supabase_client.table("songs").select("storage_url, thumbnail_url").eq("id", song_id).limit(1).execute()
                        
                        if result.data:
                            current_record = result.data[0]
                            expected_storage_url = get_b2_url(song_id, "audio")
                            expected_thumbnail_url = get_b2_url(song_id, "thumbnail")
                            
                            if (current_record.get("storage_url") != expected_storage_url or 
                                current_record.get("thumbnail_url") != expected_thumbnail_url):
                                # URLs need updating - use debug instead of info to reduce terminal output
                                logger.debug(f"Force updating URLs for song {song_id}")
                                stats["url_updates"] += 1
                            else:
                                # Skip incremental check as we'll process this anyway due to URL update
                                logger.debug(f"URLs already correct for {song_id}")
                    except Exception as e:
                        logger.error(f"Error checking URLs for {song_id}: {e}")
                        # Continue processing anyway
                # Otherwise do normal incremental check
                elif incremental and not force and enable_versioning:
                    # Get current version data
                    _, current_version = get_latest_version(supabase_client, song_id)
                    
                    # Skip only if same hash AND content is identical
                    if current_version and current_version.get("file_hash") == file_hash:
                        # Compare important metadata fields to detect subtle changes
                        current_data = current_version.get("data", {})
                        metadata_fields = ["title", "artist", "album", "description", "youtube_url", "storage_url", "thumbnail_url"]
                        content_changed = False
                        
                        for field in metadata_fields:
                            if field in record_data and field in current_data and record_data[field] != current_data[field]:
                                # Use debug instead of info for URL-related changes
                                if field in ["storage_url", "thumbnail_url"]:
                                    logger.debug(f"Detected change in '{field}' for song {song_id} despite same hash")
                                else:
                                    logger.info(f"Detected change in '{field}' for song {song_id} despite same hash")
                                content_changed = True
                                stats["metadata_changes"] += 1
                                break
                            
                            if field in record_data and (field not in current_data or current_data[field] is None):
                                # Use debug instead of info for URL-related changes
                                if field in ["storage_url", "thumbnail_url"]:
                                    logger.debug(f"Field '{field}' added for song {song_id}")
                                else:
                                    logger.info(f"Field '{field}' added for song {song_id}")
                                content_changed = True
                                stats["metadata_changes"] += 1
                                break
                        
                        # Skip only if content hasn't changed
                        if not content_changed:
                            stats["skipped_unchanged"] += 1
                            # Update index even for skipped files to capture current mtime
                            update_file_index(index, str(json_file), file_hash, success=True)
                            # Save index incrementally after each file
                            if incremental:
                                save_file_index(index)
                            progress_bar.update(1)
                            continue
                
                # Check if the associated media file exists (if checking is enabled)
                if not skip_media_check and base_dir:
                    media_path = Path(base_dir) / metadata.get("file_path", "")
                    if not media_path.exists():
                        logger.warning(f"Media file not found: {media_path}")
                    stats["missing_media"] += 1
                    progress_bar.update(1)
                    continue
                
                # Track null values for data quality reporting
                total_records += 1
                for column in null_value_counts.keys():
                    if column not in record_data or record_data[column] is None:
                        null_value_counts[column] += 1
                
                # Extract tags before adding to batch
                tags = record_data.pop("tags", [])
                
                # Add to the current batch
                batch_data.append(record_data)
                batch_file_info.append((json_file, file_hash, tags))
                
                # Process the batch if it reaches the batch size
                if len(batch_data) >= batch_size:
                    success = process_batch(supabase_client, batch_data, batch_file_info, stats, enable_versioning)
                    
                    # Update file index for processed files
                    if success and incremental:
                        for i, (file_path, file_hash, _) in enumerate(batch_file_info):
                            update_file_index(index, str(file_path), file_hash, success=True)
                        # Save index incrementally after each batch
                        save_file_index(index)
                    
                    # Update progress bar with brief batch stats
                    progress_bar.set_postfix(
                        batch=stats["batch_count"], 
                        processed=stats["processed_files"],
                        errors=stats["api_errors"]
                    )
                    batch_data = []
                    batch_file_info = []
                
                stats["processed_files"] += 1
                progress_bar.update(1)
                
            except json.JSONDecodeError:
                logger.warning(f"Error decoding JSON: {json_file}")
                stats["json_decode_errors"] += 1
                progress_bar.update(1)
            except Exception as e:
                logger.error(f"Error processing {json_file}: {e}")
                stats["api_errors"] += 1
                progress_bar.update(1)
    
    # Process any remaining records in the last batch
    if batch_data:
        success = process_batch(supabase_client, batch_data, batch_file_info, stats, enable_versioning)
        
        # Update file index for the last batch
        if success and incremental:
            for i, (file_path, file_hash, _) in enumerate(batch_file_info):
                update_file_index(index, str(file_path), file_hash, success=True)
            # Save index incrementally after the final batch
            save_file_index(index)
    
    # Restore console handler level
    console_handler.setLevel(original_level)
    
    # Add data quality stats
    stats["total_records"] = total_records
    stats["null_values"] = null_value_counts
    
    return stats

def process_batch(
    supabase_client, 
    batch_data: List[Dict[str, Any]], 
    batch_file_info: List[Tuple], 
    stats: Dict[str, int],
    enable_versioning: bool
) -> bool:
    """Process a batch of records.
    
    Returns:
        bool: Whether processing was successful
    """
    if not batch_data:
        return True
    
    try:
        # Clean up batch data for Supabase
        # Ensure all records have the same keys to avoid "All object keys must match" error
        all_keys = set()
        for record in batch_data:
            all_keys.update(record.keys())
        
        # Normalize all records to have the same keys
        for record in batch_data:
            for key in all_keys:
                if key not in record:
                    record[key] = None
        
        # Perform upsert operation with retry
        result = retry_api_call(
            lambda: supabase_client.table("songs").upsert(
                batch_data,
                on_conflict="id"
            ).execute()
        )
        
        # Process versioning and tags for each record - but silently
        versions_created = 0
        for i, record in enumerate(batch_data):
            if i < len(batch_file_info):  # Make sure we have file info for this record
                song_id = record.get("id")
                if song_id:
                    # Save version if enabled
                    if enable_versioning:
                        _, file_hash, tags = batch_file_info[i]
                        version_num = save_version(supabase_client, song_id, record, file_hash)
                        if version_num > 1:  # If this is not the first version
                            versions_created += 1
                    
                    # Process tags if any
                    _, _, tags = batch_file_info[i]
                    if tags:
                        try:
                            insert_tags(supabase_client, song_id, tags)
                        except Exception as e:
                            logger.error(f"Error inserting tags for song {song_id}: {e}")
        
        stats["batch_count"] += 1
        stats["new_versions_created"] += versions_created
        logger.debug(f"Processed batch {stats['batch_count']} with {len(batch_data)} records")
        return True
    except Exception as e:
        logger.error(f"Error processing batch: {e}")
        stats["api_errors"] += 1
        return False

def delete_today_uploads(clean_versions: bool = True) -> Dict[str, int]:
    """
    Delete all records uploaded today from the Supabase database.
    
    Args:
        clean_versions: Whether to also delete versioning records
        
    Returns:
        Statistics about the deletion operation
    """
    # Initialize Supabase client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    
    supabase_client = create_client(url, key)
    
    # Get today's date in ISO format
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Statistics
    stats = {
        "songs_deleted": 0,
        "versions_deleted": 0,
        "song_tags_deleted": 0,
        "api_errors": 0
    }
    
    print(f"Deleting records uploaded today ({today})...")
    
    try:
        # 1. Get all song IDs updated today
        result = supabase_client.table("songs") \
            .select("id") \
            .gte("updated_at", f"{today}T00:00:00Z") \
            .execute()
        
        today_song_ids = [record["id"] for record in result.data]
        
        if not today_song_ids:
            print("No songs found uploaded today.")
            return stats
        
        print(f"Found {len(today_song_ids)} songs uploaded today.")
        
        # 2. Delete song_tags relations for these songs
        if today_song_ids:
            try:
                # Delete in batches to avoid query size limits
                batch_size = 100
                for i in range(0, len(today_song_ids), batch_size):
                    batch_ids = today_song_ids[i:i+batch_size]
                    tags_result = supabase_client.table("song_tags") \
                        .delete() \
                        .in_("song_id", batch_ids) \
                        .execute()
                    
                    stats["song_tags_deleted"] += len(tags_result.data)
            except Exception as e:
                logger.error(f"Error deleting song_tags: {e}")
                stats["api_errors"] += 1
        
        # 3. Delete versions for these songs if requested
        if clean_versions and today_song_ids:
            try:
                # Delete in batches to avoid query size limits
                for i in range(0, len(today_song_ids), batch_size):
                    batch_ids = today_song_ids[i:i+batch_size]
                    versions_result = supabase_client.table("song_versions") \
                        .delete() \
                        .in_("song_id", batch_ids) \
                        .execute()
                    
                    stats["versions_deleted"] += len(versions_result.data)
                except Exception as e:
                logger.error(f"Error deleting song versions: {e}")
                    stats["api_errors"] += 1
                
        # 4. Delete the songs themselves
        if today_song_ids:
            try:
                # Delete in batches to avoid query size limits
                for i in range(0, len(today_song_ids), batch_size):
                    batch_ids = today_song_ids[i:i+batch_size]
                    songs_result = supabase_client.table("songs") \
                        .delete() \
                        .in_("id", batch_ids) \
                        .execute()
                    
                    stats["songs_deleted"] += len(songs_result.data)
            except Exception as e:
                logger.error(f"Error deleting songs: {e}")
                stats["api_errors"] += 1
        
    except Exception as e:
        logger.error(f"Error in delete operation: {e}")
        stats["api_errors"] += 1
    
    return stats

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Upload metadata to Supabase")
    parser.add_argument("--metadata-dir", help="Directory containing metadata JSON files")
    parser.add_argument("--base-dir", help="Base directory for media files (optional)")
    parser.add_argument("--b2-bucket", help="Backblaze B2 bucket name (optional)")
    parser.add_argument("--incremental", action="store_true", help="Only process new or changed files")
    parser.add_argument("--force", action="store_true", help="Force processing of all files regardless of history")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Batch size (default: {BATCH_SIZE})")
    parser.add_argument("--no-versioning", action="store_true", help="Disable versioning of records")
    parser.add_argument("--skip-media-check", action="store_true", help="Skip checking if media files exist")
    parser.add_argument("--detailed-log", action="store_true", help="Enable detailed logging to console")
    parser.add_argument("--delete-today", action="store_true", help="Delete all records uploaded today and exit")
    parser.add_argument("--keep-versions", action="store_true", help="When using --delete-today, keep version history")
    parser.add_argument("--rebuild-index", action="store_true", help="Force rebuild the local file index")
    parser.add_argument("--skip-quality-report", action="store_true", help="Skip data quality report generation")
    parser.add_argument("--force-url-updates", action="store_true", help="Force update of storage and thumbnail URLs")
    
    args = parser.parse_args()
    
    # Configure logging based on detailed-log flag
    if args.detailed_log:
        console_handler.setLevel(logging.INFO)
    
    # Handle deletion mode
    if args.delete_today:
        print("\nDELETE MODE ACTIVATED")
        print("--------------------------------")
        print("This will delete all records uploaded today from the database.")
        confirmation = input("Are you sure you want to continue? (y/N): ")
        
        if confirmation.lower() != 'y':
            print("Operation cancelled.")
            return
        
        stats = delete_today_uploads(clean_versions=not args.keep_versions)
        
        print("\n--------------------------------")
        print("DELETION STATISTICS")
        print("--------------------------------")
        print(f"Songs deleted: {stats['songs_deleted']}")
        print(f"Song tags deleted: {stats['song_tags_deleted']}")
        print(f"Version records deleted: {stats['versions_deleted']}")
        print(f"API errors: {stats['api_errors']}")
        print("--------------------------------")
        return  # Exit after deletion
    
    # Handle rebuild index mode
    if args.rebuild_index:
        print("\nINDEX REBUILD MODE")
        print("--------------------------------")
        print("Rebuilding the local file index...")
        
        # Create an empty index
        index = {"files": {}, "last_run": None}
        save_file_index(index)
        
        print("Index file has been reset.")
        
        if not args.metadata_dir:
            # If only rebuilding the index, exit
            return
    
    # Require metadata_dir for normal operation
    if not args.metadata_dir:
        parser.error("--metadata-dir is required unless using --delete-today")
    
    # Validate arguments
    metadata_dir = Path(args.metadata_dir)
    
    if not metadata_dir.exists() or not metadata_dir.is_dir():
        raise ValueError(f"Metadata directory does not exist: {metadata_dir}")
    
    if args.base_dir:
        base_dir = Path(args.base_dir)
        if not base_dir.exists() or not base_dir.is_dir():
            raise ValueError(f"Base directory does not exist: {base_dir}")
    
    print(f"\nStarting metadata upload process")
    print(f"--------------------------------")
    print(f"Metadata directory: {metadata_dir}")
    print(f"Batch size: {args.batch_size}")
    print(f"Incremental mode: {'Enabled' if args.incremental else 'Disabled'}")
    if args.incremental:
        index = load_file_index()
        indexed_count = len(index.get("files", {}))
        print(f"Index file: {os.path.abspath(INDEX_FILE)} ({indexed_count} files indexed)")
    print(f"Versioning: {'Disabled' if args.no_versioning else 'Enabled'}")
    print(f"Media check: {'Disabled' if args.skip_media_check else 'Enabled'}")
    print(f"Force URL updates: {'Enabled' if args.force_url_updates else 'Disabled'}")
    print(f"--------------------------------\n")
    
    # Upload metadata
    start_time = time.time()
    stats = upload_metadata_to_supabase(
        str(metadata_dir),
        args.base_dir,
        args.b2_bucket,
        args.incremental,
        args.force,
        args.batch_size,
        not args.no_versioning,  # Enable versioning by default
        args.skip_media_check,
        args.force_url_updates
    )
    end_time = time.time()
    elapsed_time = end_time - start_time
    
    # Print statistics
    print("\n--------------------------------")
    print("UPLOAD STATISTICS")
    print("--------------------------------")
    print(f"Total files processed: {stats['total_files']}")
    print(f"Successfully processed: {stats['processed_files']}")
    if args.incremental:
        print(f"Skipped (from index): {stats.get('skipped_indexed', 0)}")
    print(f"Skipped (unchanged): {stats['skipped_unchanged']}")
    if 'metadata_changes' in stats and stats['metadata_changes'] > 0:
        print(f"Metadata changes detected: {stats['metadata_changes']}")
    if 'url_updates' in stats and stats['url_updates'] > 0:
        print(f"URL updates: {stats['url_updates']}")
    print(f"Empty files: {stats['empty_files']}")
    if not args.skip_media_check:
        print(f"Missing media: {stats['missing_media']}")
    print(f"JSON decode errors: {stats['json_decode_errors']}")
    print(f"API errors: {stats['api_errors']}")
    print(f"Batch count: {stats['batch_count']}")
    if 'new_versions_created' in stats:
        print(f"New versions created: {stats['new_versions_created']}")
    
    # Format time nicely
    hours, remainder = divmod(elapsed_time, 3600)
    minutes, seconds = divmod(remainder, 60)
    time_format = f"{int(hours):02d}:{int(minutes):02d}:{seconds:.2f}"
    print(f"Time elapsed: {time_format}")
    
    files_per_sec = stats['processed_files'] / elapsed_time if elapsed_time > 0 else 0
    print(f"Processing rate: {files_per_sec:.2f} files/second")
    print("--------------------------------")
    
    # Print data quality report if not skipped
    if not args.skip_quality_report and stats.get("total_records", 0) > 0:
        print("\nDATA QUALITY REPORT")
        print("--------------------------------")
        null_values = stats.get("null_values", {})
        total_records = stats["total_records"]
        
        # Sort by null percentage (descending) to highlight problems first
        sorted_columns = sorted(
            null_values.items(), 
            key=lambda x: x[1] / total_records if total_records > 0 else 0,
            reverse=True
        )
        
        for column, null_count in sorted_columns:
            percentage = (null_count / total_records) * 100
            quality = "POOR" if percentage > 50 else "FAIR" if percentage > 10 else "GOOD"
            print(f"{column:15s}: {null_count:5d}/{total_records} ({percentage:6.1f}%) - {quality}")
            
            # Log warnings for columns with high null rates
            if percentage > 50:
                logger.warning(f"Column '{column}' has {percentage:.1f}% null values")
        
        print("--------------------------------")
        logger.info("Data quality report completed")
    elif not args.skip_quality_report:
        print("\nNo records processed for data quality analysis.")
    
    print("\nLog file: upload_to_supabase.log")
    print("--------------------------------")

if __name__ == "__main__":
    main() 