import boto3
from botocore.client import Config
import os
from dotenv import load_dotenv
import requests

# Load environment variables
load_dotenv()

def test_b2_access():
    print("Testing B2 Access...")
    
    # Get credentials from env
    B2_KEY_ID = os.getenv('B2_KEY_ID')
    B2_APP_KEY = os.getenv('B2_APP_KEY')
    B2_BUCKET_NAME = os.getenv('B2_BUCKET_NAME')
    
    if not all([B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME]):
        print("Error: Missing required B2 credentials in .env file")
        return None
    
    # Format credentials and endpoint for B2 compatibility
    B2_ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com'  # Use B2's S3-compatible endpoint
    
    print(f"\nCredentials loaded:")
    print(f"Key ID: {B2_KEY_ID[:10]}...")  # Show first part of key ID
    print(f"Bucket: {B2_BUCKET_NAME}")
    print(f"Endpoint: {B2_ENDPOINT}")
    
    try:
        # Initialize S3 client
        print("\nInitializing S3 client...")
        s3_client = boto3.client(
            's3',
            endpoint_url=B2_ENDPOINT,
            aws_access_key_id=B2_KEY_ID,
            aws_secret_access_key=B2_APP_KEY,
            region_name='eu-central-003',
            config=Config(
                signature_version='s3v4',
                s3={
                    'addressing_style': 'path',
                    'payload_signing_enabled': True
                }
            )
        )

        # Test the connection
        response = s3_client.list_objects_v2(Bucket=B2_BUCKET_NAME)
        if response.get('Contents'):
            print(f"Success! {len(response.get('Contents'))} objects found.")
            # Print first object's key for testing
            if response['Contents']:
                print("\nFirst object in bucket:")
                for obj in response['Contents']:
                    if obj['Key'].endswith('.mp3'):
                        print(f"Found MP3: {obj['Key']}")
                        return s3_client, B2_BUCKET_NAME, obj['Key']
        else:
            print("No objects found in the bucket.")
            return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def test_download_mp3(s3_client, bucket_name, file_key):
    try:
        print(f"\nTesting download of file: {file_key}")
        
        # Generate a pre-signed URL for the object
        print("Generating pre-signed URL...")
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket_name,
                'Key': file_key
            },
            ExpiresIn=3600  # URL valid for 1 hour
        )
        print(f"Generated URL (first 100 chars): {presigned_url[:100]}...")
        
        # Try to download the file
        print("\nTesting download...")
        response = requests.get(presigned_url, stream=True)
        
        if response.status_code == 200:
            # Save the file locally
            local_filename = os.path.join(os.path.dirname(__file__), "test_download.mp3")
            total_size = 0
            with open(local_filename, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        total_size += len(chunk)
                        f.write(chunk)
            
            print(f"Success! Downloaded {total_size/1024/1024:.2f} MB to {local_filename}")
        else:
            print(f"Failed to download. Status code: {response.status_code}")
            print(f"Error message: {response.text}")
            
    except Exception as e:
        print(f"Error during download test: {e}")

if __name__ == "__main__":
    result = test_b2_access()
    if result:
        s3_client, bucket_name, file_key = result
        test_download_mp3(s3_client, bucket_name, file_key)
