"""
Supabase client for backend integration.
This module provides a singleton client for accessing Supabase.
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables if not already loaded
if os.path.exists('.env'):
    load_dotenv()

# Get Supabase credentials from environment variables
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase credentials not found in environment variables")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_client() -> Client:
    """
    Get the Supabase client instance.
    Returns:
        Client: The initialized Supabase client
    """
    return supabase 