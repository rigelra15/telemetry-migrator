import requests
import json
import os
import sys
import time
from auth_utils import ensure_token, handle_unauthorized

CONFIG_PATH = "config/config_post.json"
DEFAULT_CONFIG = {
    "url": "https://flexiot.xlsmart.co.id",
    "entity_name": "PWSS-IDM-03",
    "entity_id": "5bf9fc50-70fa-11f0-8e7f-3d041346deb6",
    "entity_type": "ASSET",
    "scope": "ANY",
    "cred": "auth/credentials.txt",
    "token": "auth/token.txt",
    "refresh_token": "auth/refreshToken.txt",
    "input_file": None,
    "batch_size": 100
}

def load_config():
    config = DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_PATH, "r") as file:
            file_config = json.load(file)
            if isinstance(file_config, dict):
                config.update(file_config)
    except FileNotFoundError:
        print(f"Config file not found: {CONFIG_PATH}. Using defaults.")
    except json.JSONDecodeError:
        print(f"Config file invalid: {CONFIG_PATH}. Using defaults.")
    return config

CONFIG = load_config()


def load_telemetry_data(file_path):
    """Load telemetry data from JSON file"""
    try:
        with open(file_path, "r") as file:
            data = json.load(file)
            if not isinstance(data, list):
                print("Error: JSON file must contain an array of telemetry records")
                return None
            return data
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Invalid JSON file: {file_path}")
        return None


def post_telemetry_batch(token, telemetry_batch):
    """Post a batch of telemetry data"""
    url = f"{CONFIG['url']}/api/plugins/telemetry/{CONFIG['entity_type']}/{CONFIG['entity_id']}/timeseries/{CONFIG['scope']}"
    headers = {
        "X-Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Transform data to ThingsBoard format
    payload = []
    for record in telemetry_batch:
        payload.append({
            "ts": record["ts"],
            "values": record["values"]
        })
    
    response = requests.post(url, headers=headers, json=payload)
    
    # Handle unauthorized
    if response.status_code == 401:
        new_token = handle_unauthorized(CONFIG["url"], CONFIG["cred"], CONFIG["token"], CONFIG["refresh_token"])
        if not new_token:
            return None, response.status_code
        headers["X-Authorization"] = f"Bearer {new_token}"
        response = requests.post(url, headers=headers, json=payload)
        return new_token, response.status_code
    
    return token, response.status_code


def post_telemetry():
    start_time = time.time()
    
    # Get input file
    input_file = CONFIG.get("input_file")
    if not input_file:
        print("Error: No input file specified. Use --file argument or set input_file in config.")
        return
    
    # Load data
    print(f"Loading data from: {input_file}")
    telemetry_data = load_telemetry_data(input_file)
    if not telemetry_data:
        return
    
    total_records = len(telemetry_data)
    print(f"Total records to post: {total_records}")
    
    # Get token
    token = ensure_token(CONFIG["url"], CONFIG["cred"], CONFIG["token"], CONFIG["refresh_token"])
    if not token:
        print("Authentication token not available")
        return
    
    # Post in batches
    batch_size = CONFIG.get("batch_size", 100)
    posted_count = 0
    failed_count = 0
    
    for i in range(0, total_records, batch_size):
        batch = telemetry_data[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total_records + batch_size - 1) // batch_size
        
        print(f"Posting batch {batch_num}/{total_batches} ({len(batch)} records)...", end=" ")
        
        token, status_code = post_telemetry_batch(token, batch)
        
        if status_code == 200:
            posted_count += len(batch)
            print("✓ Success")
        else:
            failed_count += len(batch)
            print(f"✗ Failed (HTTP {status_code})")
    
    # Summary
    elapsed_time = time.time() - start_time
    print(f"\n{'='*50}")
    print(f"Posted: {posted_count}/{total_records}")
    print(f"Failed: {failed_count}/{total_records}")
    print(f"⏱️  Process completed in {elapsed_time:.2f} seconds")


if __name__ == "__main__":
    # Allow file path from command line argument
    if len(sys.argv) > 1:
        CONFIG["input_file"] = sys.argv[1]
    
    # Allow batch size from command line argument
    if len(sys.argv) > 2:
        try:
            CONFIG["batch_size"] = int(sys.argv[2])
        except ValueError:
            print("Invalid batch size. Using default from config.")
    
    post_telemetry()
