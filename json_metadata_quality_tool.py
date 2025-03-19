#!/usr/bin/env python3
import os
import json
import sys
import argparse
from collections import Counter, OrderedDict
from datetime import datetime
import shutil
import uuid

class JsonMetadataQualityTool:
    """
    A comprehensive tool for analyzing and fixing JSON metadata quality.
    """
    
    def __init__(self, new_dir, original_dir=None, verbose=False, auto_fix=False):
        """
        Initialize the JSON metadata quality tool.
        
        Args:
            new_dir: Directory containing the JSON files to analyze/fix
            original_dir: Optional directory with original metadata files for reference
            verbose: Whether to print detailed information
            auto_fix: Whether to automatically fix issues without prompting
        """
        self.new_dir = new_dir
        self.original_dir = original_dir
        self.verbose = verbose
        self.auto_fix = auto_fix
        
        # Initialize tracking variables
        self.json_files = []
        self.total_files = 0
        self.key_counter = Counter()
        self.file_keys = {}
        self.common_keys = []
        self.files_with_missing_keys = {}
        self.files_with_unusual_keys = {}
        self.errors = []
        
        # Define standard keys that should exist in all files
        self.standard_keys = [
            'id', 'title', 'artist', 'album', 'duration', 'release_date',
            'view_count', 'like_count', 'description', 'tags',
            'thumbnail_url', 'audio_url', 'created_at', 'local_paths',
            'source_id', 'source_url'
        ]
    
    def run(self):
        """
        Run the full metadata quality check and fix process.
        """
        self._load_files()
        
        if not self.json_files:
            print("No JSON files found. Exiting.")
            return
        
        # Step 1: Analyze JSON schema
        self._analyze_json_schema()
        
        # Step 2: Identify files with missing keys
        self._identify_files_with_missing_keys()
        
        # Step 3: Identify files with unusual keys
        self._identify_files_with_unusual_keys()
        
        # Step 4: Display summary
        self._display_summary()
        
        # Step 5: Fix issues if requested or auto_fix enabled
        if self.files_with_missing_keys or self.files_with_unusual_keys:
            if self.auto_fix or self._prompt_for_fix():
                # Fix missing keys first
                if self.files_with_missing_keys and self.original_dir:
                    self._fix_missing_keys()
                
                # Then remove unusual keys
                if self.files_with_unusual_keys:
                    self._remove_unusual_keys()
                
                # Final verification
                self._verify_fixes()
    
    def _load_files(self):
        """
        Load the list of JSON files from the directory.
        """
        print(f"Loading JSON files from: {self.new_dir}")
        
        if not os.path.exists(self.new_dir):
            print(f"Error: Directory '{self.new_dir}' does not exist.")
            return
        
        self.json_files = [f for f in os.listdir(self.new_dir) if f.endswith('.json')]
        self.total_files = len(self.json_files)
        
        if self.total_files == 0:
            print("No JSON files found in the directory.")
            return
        
        print(f"Found {self.total_files} JSON files.")
        
        if self.original_dir and not os.path.exists(self.original_dir):
            print(f"Warning: Original directory '{self.original_dir}' does not exist.")
            self.original_dir = None
    
    def _analyze_json_schema(self):
        """
        Analyze the JSON schema to identify common keys and patterns.
        """
        print("\nAnalyzing JSON schema...")
        
        for i, filename in enumerate(self.json_files):
            if (i + 1) % 500 == 0 or i + 1 == self.total_files:
                print(f"Processing file {i + 1}/{self.total_files}...")
            
            file_path = os.path.join(self.new_dir, filename)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                if not isinstance(data, dict):
                    self.errors.append((filename, "Root is not a dictionary"))
                    continue
                
                # Extract keys
                keys = set(data.keys())
                self.file_keys[filename] = keys
                
                # Update counter
                self.key_counter.update(keys)
            
            except Exception as e:
                self.errors.append((filename, str(e)))
                if self.verbose:
                    print(f"Error processing {filename}: {e}")
        
        # Determine common keys (present in >90% of files)
        threshold = self.total_files * 0.9
        self.common_keys = [k for k, count in self.key_counter.items() 
                           if count >= threshold]
        
        # Sort common keys by frequency
        self.common_keys.sort(key=lambda k: (-self.key_counter[k], k))
        
        print(f"Identified {len(self.key_counter)} unique keys across all files.")
        print(f"Found {len(self.common_keys)} common keys (present in >90% of files).")
    
    def _identify_files_with_missing_keys(self):
        """
        Identify files with missing common keys.
        """
        print("\nIdentifying files with missing common keys...")
        
        for filename, keys in self.file_keys.items():
            missing_keys = set(self.common_keys) - keys
            if missing_keys:
                self.files_with_missing_keys[filename] = missing_keys
        
        print(f"Found {len(self.files_with_missing_keys)} files with missing common keys.")
        
        if self.verbose and self.files_with_missing_keys:
            print("\nExample files with missing keys:")
            for i, (filename, missing) in enumerate(list(self.files_with_missing_keys.items())[:5]):
                print(f"{filename}: Missing {len(missing)} key(s) - {', '.join(sorted(missing))}")
            
            if len(self.files_with_missing_keys) > 5:
                print(f"... and {len(self.files_with_missing_keys) - 5} more files")
    
    def _identify_files_with_unusual_keys(self):
        """
        Identify files with unusual keys (not in standard keys list).
        """
        print("\nIdentifying files with unusual keys...")
        
        for filename, keys in self.file_keys.items():
            unusual_keys = keys - set(self.standard_keys)
            if unusual_keys:
                self.files_with_unusual_keys[filename] = unusual_keys
        
        print(f"Found {len(self.files_with_unusual_keys)} files with unusual keys.")
        
        if self.verbose and self.files_with_unusual_keys:
            print("\nExample files with unusual keys:")
            for i, (filename, unusual) in enumerate(list(self.files_with_unusual_keys.items())[:5]):
                print(f"{filename}: Contains {len(unusual)} unusual key(s) - {', '.join(sorted(unusual))}")
            
            if len(self.files_with_unusual_keys) > 5:
                print(f"... and {len(self.files_with_unusual_keys) - 5} more files")
    
    def _display_summary(self):
        """
        Display a summary of the analysis.
        """
        print("\n" + "="*50)
        print("JSON METADATA QUALITY SUMMARY")
        print("="*50)
        
        print(f"\nTotal files analyzed: {self.total_files}")
        print(f"Files with errors: {len(self.errors)}")
        print(f"Files with missing keys: {len(self.files_with_missing_keys)}")
        print(f"Files with unusual keys: {len(self.files_with_unusual_keys)}")
        
        compliant_files = self.total_files - len(self.files_with_missing_keys) - len(self.files_with_unusual_keys)
        print(f"Fully compliant files: {compliant_files} ({compliant_files/self.total_files*100:.1f}%)")
        
        # Display common keys
        print("\nCommon keys (>90% of files):")
        for key in self.common_keys:
            count = self.key_counter[key]
            print(f"  {key}: {count} files ({count/self.total_files*100:.1f}%)")
        
        # Display non-standard keys that were found
        non_standard_keys = set(self.key_counter.keys()) - set(self.standard_keys)
        if non_standard_keys:
            print("\nNon-standard keys found:")
            for key in sorted(non_standard_keys):
                count = self.key_counter[key]
                print(f"  {key}: {count} files ({count/self.total_files*100:.1f}%)")
    
    def _prompt_for_fix(self):
        """
        Prompt the user to fix issues.
        
        Returns:
            bool: Whether to proceed with fixes
        """
        print("\n" + "="*50)
        print("FIX OPTIONS")
        print("="*50)
        
        if self.files_with_missing_keys and self.original_dir:
            print(f"- Fix {len(self.files_with_missing_keys)} files with missing keys")
        
        if self.files_with_unusual_keys:
            print(f"- Remove unusual keys from {len(self.files_with_unusual_keys)} files")
        
        response = input("\nWould you like to fix these issues? (y/n): ")
        return response.lower() == 'y'
    
    def _fix_missing_keys(self):
        """
        Fix files with missing keys by copying values from original files.
        """
        print("\nFixing files with missing keys...")
        
        fixed_count = 0
        failed_count = 0
        
        for i, (filename, missing_keys) in enumerate(self.files_with_missing_keys.items()):
            if (i + 1) % 100 == 0 or i + 1 == len(self.files_with_missing_keys):
                print(f"Fixing file {i + 1}/{len(self.files_with_missing_keys)}...")
            
            new_file_path = os.path.join(self.new_dir, filename)
            original_file_path = os.path.join(self.original_dir, filename)
            
            try:
                # Read new file
                with open(new_file_path, 'r', encoding='utf-8') as f:
                    new_data = json.load(f)
                
                # If original file exists
                if os.path.exists(original_file_path):
                    # Create backup
                    backup_path = f"{new_file_path}.bak"
                    with open(backup_path, 'w', encoding='utf-8') as f:
                        json.dump(new_data, f, indent=2, ensure_ascii=False)
                    
                    # Read original file
                    with open(original_file_path, 'r', encoding='utf-8') as f:
                        original_data = json.load(f)
                    
                    # Copy missing keys from original
                    for key in missing_keys:
                        if key in original_data:
                            new_data[key] = original_data[key]
                    
                    # Reorder keys to match standard format
                    ordered_data = OrderedDict()
                    for key in self.standard_keys:
                        if key in new_data:
                            ordered_data[key] = new_data[key]
                    
                    # Add any non-standard keys
                    for key in new_data:
                        if key not in ordered_data:
                            ordered_data[key] = new_data[key]
                    
                    # Save the updated file
                    with open(new_file_path, 'w', encoding='utf-8') as f:
                        json.dump(ordered_data, f, indent=2, ensure_ascii=False)
                    
                    fixed_count += 1
                else:
                    if self.verbose:
                        print(f"Warning: Original file not found for {filename}")
                    failed_count += 1
            
            except Exception as e:
                if self.verbose:
                    print(f"Error fixing {filename}: {e}")
                failed_count += 1
        
        print(f"Fixed {fixed_count} files with missing keys.")
        if failed_count > 0:
            print(f"Failed to fix {failed_count} files.")
    
    def _remove_unusual_keys(self):
        """
        Remove unusual keys from files.
        """
        print("\nRemoving unusual keys from files...")
        
        fixed_count = 0
        failed_count = 0
        unusual_keys_removed = 0
        
        for i, (filename, unusual_keys) in enumerate(self.files_with_unusual_keys.items()):
            if (i + 1) % 100 == 0 or i + 1 == len(self.files_with_unusual_keys):
                print(f"Processing file {i + 1}/{len(self.files_with_unusual_keys)}...")
            
            file_path = os.path.join(self.new_dir, filename)
            
            try:
                # Read file
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Create backup
                backup_path = f"{file_path}.bak"
                if not os.path.exists(backup_path):  # Don't overwrite existing backup
                    with open(backup_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                
                # Create a new ordered dictionary with only the standard keys
                ordered_data = OrderedDict()
                for key in self.standard_keys:
                    if key in data:
                        ordered_data[key] = data[key]
                
                # Save the modified file
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(ordered_data, f, indent=2, ensure_ascii=False)
                
                fixed_count += 1
                unusual_keys_removed += len(unusual_keys)
                
                if self.verbose:
                    print(f"Removed {len(unusual_keys)} unusual keys from {filename}")
            
            except Exception as e:
                if self.verbose:
                    print(f"Error processing {filename}: {e}")
                failed_count += 1
        
        print(f"Removed {unusual_keys_removed} unusual keys from {fixed_count} files.")
        if failed_count > 0:
            print(f"Failed to process {failed_count} files.")
    
    def _verify_fixes(self):
        """
        Verify that fixes were successful.
        """
        print("\nVerifying fixes...")
        
        # Reset counters and data
        self.key_counter = Counter()
        self.file_keys = {}
        self.files_with_missing_keys = {}
        self.files_with_unusual_keys = {}
        
        # Re-analyze files
        for filename in self.json_files:
            file_path = os.path.join(self.new_dir, filename)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                keys = set(data.keys())
                self.file_keys[filename] = keys
                self.key_counter.update(keys)
            
            except Exception:
                continue  # Skip files with errors
        
        # Check for missing keys
        for filename, keys in self.file_keys.items():
            missing_keys = set(self.common_keys) - keys
            if missing_keys:
                self.files_with_missing_keys[filename] = missing_keys
        
        # Check for unusual keys
        for filename, keys in self.file_keys.items():
            unusual_keys = keys - set(self.standard_keys)
            if unusual_keys:
                self.files_with_unusual_keys[filename] = unusual_keys
        
        compliant_files = self.total_files - len(self.files_with_missing_keys) - len(self.files_with_unusual_keys)
        print(f"\nAfter fixes:")
        print(f"Files with missing keys: {len(self.files_with_missing_keys)}")
        print(f"Files with unusual keys: {len(self.files_with_unusual_keys)}")
        print(f"Fully compliant files: {compliant_files} ({compliant_files/self.total_files*100:.1f}%)")
    
    def generate_report(self, output_file="json_metadata_quality_report.txt"):
        """
        Generate a detailed report of the analysis.
        
        Args:
            output_file: Path to output file for the report
        """
        print(f"\nGenerating detailed report: {output_file}")
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("="*70 + "\n")
            f.write("JSON METADATA QUALITY REPORT\n")
            f.write("="*70 + "\n\n")
            
            f.write("SUMMARY:\n")
            f.write("-"*50 + "\n")
            f.write(f"Total files analyzed: {self.total_files}\n")
            f.write(f"Files with errors: {len(self.errors)}\n")
            f.write(f"Files with missing keys: {len(self.files_with_missing_keys)}\n")
            f.write(f"Files with unusual keys: {len(self.files_with_unusual_keys)}\n")
            
            compliant_files = self.total_files - len(self.files_with_missing_keys) - len(self.files_with_unusual_keys)
            f.write(f"Fully compliant files: {compliant_files} ({compliant_files/self.total_files*100:.1f}%)\n\n")
            
            f.write("ALL KEYS (by frequency):\n")
            f.write("-"*50 + "\n")
            for key, count in sorted(self.key_counter.items(), key=lambda x: (-x[1], x[0])):
                f.write(f"{key}: {count} files ({count/self.total_files*100:.1f}%)\n")
            
            f.write("\nCOMMON KEYS (>90% of files):\n")
            f.write("-"*50 + "\n")
            for key in self.common_keys:
                count = self.key_counter[key]
                f.write(f"{key}: {count} files ({count/self.total_files*100:.1f}%)\n")
            
            if self.files_with_missing_keys:
                f.write("\nFILES WITH MISSING KEYS:\n")
                f.write("-"*50 + "\n")
                for filename, missing in sorted(self.files_with_missing_keys.items()):
                    f.write(f"{filename}: Missing {len(missing)} key(s) - {', '.join(missing)}\n")
            
            if self.files_with_unusual_keys:
                f.write("\nFILES WITH UNUSUAL KEYS:\n")
                f.write("-"*50 + "\n")
                for filename, unusual in sorted(self.files_with_unusual_keys.items()):
                    f.write(f"{filename}: Contains {len(unusual)} unusual key(s) - {', '.join(unusual)}\n")
            
            if self.errors:
                f.write("\nFILES WITH ERRORS:\n")
                f.write("-"*50 + "\n")
                for filename, error in self.errors:
                    f.write(f"{filename}: {error}\n")
        
        print(f"Report generated: {output_file}")

def main():
    parser = argparse.ArgumentParser(
        description="JSON Metadata Quality Tool - Analyze and fix JSON metadata files"
    )
    
    parser.add_argument("new_dir", nargs="?", 
                        default=r"G:\Github\audio-foundation\database\dataset_mp3_metadata_llm\new_files",
                        help="Directory containing JSON files to analyze/fix")
    
    parser.add_argument("--original-dir", "-o", 
                        default=r"G:\Github\audio-foundation\database\dataset_mp3_metadata",
                        help="Directory containing original metadata files for reference")
    
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Print detailed information")
    
    parser.add_argument("--auto-fix", "-a", action="store_true",
                        help="Automatically fix issues without prompting")
    
    parser.add_argument("--report", "-r", action="store_true",
                        help="Generate a detailed report")
    
    args = parser.parse_args()
    
    # Create and run the tool
    tool = JsonMetadataQualityTool(
        new_dir=args.new_dir,
        original_dir=args.original_dir,
        verbose=args.verbose,
        auto_fix=args.auto_fix
    )
    
    tool.run()
    
    if args.report:
        tool.generate_report()

if __name__ == "__main__":
    main() 