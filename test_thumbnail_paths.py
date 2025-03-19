#!/usr/bin/env python
"""
A simple script to test the thumbnail path formatting logic
without needing to run the full application.
"""

import os
import sys

def format_thumbnail_path(song_id):
    """
    Format the song_id to match B2 storage format using the same logic as the app.py file.
    Tests the transformation from 7-digit IDs to 6-digit IDs for B2 path access.
    """
    # Format the song_id to match B2 storage format (6 digits, remove first zero from 7-digit ID)
    if len(song_id) == 7 and song_id.startswith('0'):
        formatted_id = song_id[1:]  # Remove the first zero for 7-digit IDs
        print(f"Formatted song ID from {song_id} to {formatted_id} for B2 path")
    else:
        formatted_id = song_id
        print(f"Using original song ID format: {formatted_id}")
    
    # Generate the thumbnail path
    thumbnail_path = f"thumbnails/{formatted_id}.png"
    print(f"Final thumbnail path: {thumbnail_path}")
    
    return thumbnail_path

def main():
    # Test with a variety of song IDs from the screenshot
    test_ids = [
        "0000500", "0000600", "0000670", "0000805", "0000807",
        "0000826", "0000827", "0000828", "0000829", "0000834",
        "0000835", "0000836", "0000864", "0000865", "0000866",
        "0000867", "0000890", "0000986", "0000987", "0000988"
    ]
    
    print("Testing thumbnail path formatting logic:")
    print("=" * 50)
    
    for song_id in test_ids:
        path = format_thumbnail_path(song_id)
        print("-" * 50)
    
    # Also test with some edge cases
    edge_cases = [
        "123",           # Short ID
        "0123456",       # 7-digit with leading zero (should be transformed)
        "1234567",       # 7-digit without leading zero
        "00123",         # ID with multiple leading zeros
        "abc123"         # Non-numeric ID
    ]
    
    print("\nTesting edge cases:")
    print("=" * 50)
    
    for song_id in edge_cases:
        path = format_thumbnail_path(song_id)
        print("-" * 50)

if __name__ == "__main__":
    main() 