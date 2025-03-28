# Spotify Clone Debug Tools

These scripts help you debug your Spotify clone application's functionality.

## Thumbnail Tester

Tests thumbnail loading for songs in your database.

```bash
python thumbnail_tester.py --limit 20     # Test first 20 songs
python thumbnail_tester.py --verbose      # Show detailed logs
python thumbnail_tester.py --ascii        # Use ASCII instead of emoji symbols
python thumbnail_tester.py --fix          # Auto-fix incorrect paths in database
```

This script:
- Connects to your Supabase database and retrieves songs
- Attempts to load thumbnails from Backblaze B2 for each song
- Tests multiple path variations to account for common issues (including different numbers of leading zeros)
- Saves successfully loaded thumbnails for inspection
- Generates a detailed report of successes and failures
- Can automatically fix incorrect thumbnail paths in the database (with --fix flag)

## Like Function Tester

Tests the like/unlike functionality for songs in your database.

```bash
python like_function_tester.py --email your@email.com
python like_function_tester.py --limit 5  # Test first 5 songs
python like_function_tester.py --ascii    # Use ASCII instead of emoji symbols
```

This script:
- Authenticates with your Supabase account
- Retrieves a list of songs from the database
- Tests liking and unliking each song
- Ensures the database state is preserved (restores liked songs)
- Generates a detailed report of successes and failures

## Requirements

Install the required dependencies:

```bash
pip install supabase requests python-dotenv pillow boto3
```

## Configuration

Create a `.env` file with your credentials:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
B2_KEY_ID=your_b2_key_id
B2_APP_KEY=your_b2_app_key
B2_BUCKET_NAME=your_b2_bucket_name
```

## Troubleshooting

### Encoding Issues
If you encounter encoding errors in Windows PowerShell or Command Prompt, use the `--ascii` option to avoid emoji symbols in the output files:

```bash
python thumbnail_tester.py --ascii
python like_function_tester.py --ascii
```

This will use plain text like "[SUCCESS]" and "[FAILED]" instead of emoji symbols.

### Fixed Number of Leading Zeros
The thumbnail tester now handles different numbers of leading zeros in thumbnail paths. For example, if your database stores `thumbnails/001700.png` but B2 expects `thumbnails/0001700.png`, the tester will automatically try both variations.

With the `--fix` flag, it will also update the database record with the correct path that actually worked:

```bash
python thumbnail_tester.py --fix
```
