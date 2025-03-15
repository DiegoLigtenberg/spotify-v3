# Music Player App

A web-based music player application with streaming capabilities.

## Deployment on Railway

1. Create a new project on Railway
2. Connect your GitHub repository
3. Add the following environment variables in Railway:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase project key
   - `B2_KEY_ID`: Your Backblaze B2 key ID
   - `B2_APP_KEY`: Your Backblaze B2 application key
   - `B2_BUCKET_NAME`: Your Backblaze B2 bucket name

## Local Development

1. Clone the repository
2. Create a `.env` file in the root directory with the above environment variables
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the development server:
   ```bash
   python backend/app.py
   ```

## Project Structure

- `/backend`: Flask server code
- `/frontend`: Static files and templates
  - `/static`: JavaScript, CSS, and images
  - `/templates`: HTML templates

## Features

- Music streaming with seek functionality
- Thumbnail image conversion (WebP to PNG)
- Infinite scroll for song list
- Search functionality
- Volume control
- Playlist navigation (Previous/Next)
- Progress bar with seek capability
