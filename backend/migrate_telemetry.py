import requests
import json
import pandas as pd
import os
import sys
import time
from auth_utils import ensure_token, handle_unauthorized
from datetime import datetime, timedelta, timezone

CONFIG_GET_PATH = "config/config_get.json"
CONFIG_POST_PATH = "config/config_post.json"

DEFAULT_CONFIG_GET = {
    "url": "https://flexiot.xlsmart.co.id",
    "entity_name": "PWSS-IDM-03",
    "entity_id": "5bf9fc50-70fa-11f0-8e7f-3d041346deb6",
    "entity_type": "ASSET",
    "cred": "auth/credentials.txt",
    "token": "auth/token.txt",
    "refresh_token": "auth/refreshToken.txt",
    "keys": None,
    "keys_file": "config/keys.txt",
    "start_time": "01/11/2025 00:00:00",
    "end_time": "01/11/2025 23:59:59",
    "interval": 0,
    "limit": 100,
    "use_strict_data_types": False,
    "sort_by": "ASC"
}

DEFAULT_CONFIG_POST = {
    "url": "https://flexiot.xlsmart.co.id",
    "entity_type": "ASSET",
    "scope": "ANY",
    "cred": "auth/credentials.txt",
    "token": "auth/token.txt",
    "refresh_token": "auth/refreshToken.txt",
    "batch_size": 100
}

# Logging
LOG_DIR = "logs/migration"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = f"{LOG_DIR}/migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(message):
    """Log message to both console and file"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_message = f"[{timestamp}] {message}"
    print(log_message)
    with open(LOG_FILE, "a", encoding='utf-8') as f:
        f.write(log_message + "\n")

def load_config(path, default):
    config = default.copy()
    try:
        with open(path, "r") as file:
            file_config = json.load(file)
            if isinstance(file_config, dict):
                config.update(file_config)
    except FileNotFoundError:
        log(f"Config file not found: {path}. Using defaults.")
    except json.JSONDecodeError:
        log(f"Config file invalid: {path}. Using defaults.")
    return config

def load_keys(keys_file):
    """Load telemetry keys from file"""
    try:
        with open(keys_file, "r") as file:
            raw = file.read()
            if "," in raw:
                keys = [k.strip() for k in raw.split(",")]
            else:
                keys = [line.strip() for line in raw.splitlines()]
            return [k for k in keys if k]
    except FileNotFoundError:
        log(f"Keys file not found: {keys_file}")
        return []

def transform_and_save_temp_data(data, entity_name):
    """Transform API response and save to temp JSON file"""
    grouped_data = {}
    
    for key, values in data.items():
        for item in values:
            ts = item['ts']
            value = item['value']
            
            if ts not in grouped_data:
                grouped_data[ts] = {
                    "ts": ts,
                    "values": {}
                }
            
            grouped_data[ts]["values"][key] = value
    
    result = sorted(grouped_data.values(), key=lambda x: x['ts'])
    
    # Save to temp file
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file = f"{temp_dir}/{entity_name}_{int(time.time())}.json"
    
    with open(temp_file, 'w') as f:
        json.dump(result, f, indent=4)
    
    return temp_file, len(result)

def fetch_daily_data(config_get, token, day_start, day_end, max_retries=3):
    """Fetch telemetry data for a specific day with retry logic"""
    keys = load_keys(config_get.get("keys_file"))
    if not keys:
        log("ERROR: Telemetry keys not available")
        return None
    
    url = f"{config_get['url']}/api/plugins/telemetry/{config_get['entity_type']}/{config_get['entity_id']}/values/timeseries"
    headers = {
        "X-Authorization": f"Bearer {token}"
    }
    
    params = {
        "keys": ",".join(keys),
        "startTs": int(day_start.timestamp() * 1000),
        "endTs": int(day_end.timestamp() * 1000),
        "interval": config_get["interval"],
        "useStrictDataTypes": config_get["use_strict_data_types"],
        "orderBy": config_get["sort_by"],
        "limit": config_get["limit"]
    }
    
    for attempt in range(1, max_retries + 1):
        log(f"Fetching data ({day_start.date()}) - Attempt {attempt}/{max_retries}...")
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 401:
            token = handle_unauthorized(config_get["url"], config_get["cred"], config_get["token"], config_get["refresh_token"])
            if not token:
                log(f"ERROR: Failed to refresh token")
                return None
            headers["X-Authorization"] = f"Bearer {token}"
            response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if data:
                log(f"SUCCESS: Fetched data for {day_start.date()} ({sum(len(v) for v in data.values())} records)")
                return token, data
            else:
                log(f"INFO: No data found for {day_start.date()}")
                return token, None
        else:
            log(f"WARNING: Fetch failed (HTTP {response.status_code}) - Retrying...")
            if attempt < max_retries:
                time.sleep(2)
            continue
    
    log(f"ERROR: Failed to fetch data for {day_start.date()} after {max_retries} attempts")
    return None

def post_telemetry_batch(config_post, token, telemetry_batch):
    """Post a batch of telemetry data"""
    url = f"{config_post['url']}/api/plugins/telemetry/{config_post['entity_type']}/{config_post.get('entity_id')}/timeseries/{config_post['scope']}"
    headers = {
        "X-Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = []
    for record in telemetry_batch:
        payload.append({
            "ts": record["ts"],
            "values": record["values"]
        })
    
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 401:
        new_token = handle_unauthorized(config_post["url"], config_post["cred"], config_post["token"], config_post["refresh_token"])
        if not new_token:
            return None, response.status_code
        headers["X-Authorization"] = f"Bearer {new_token}"
        response = requests.post(url, headers=headers, json=payload)
        return new_token, response.status_code
    
    return token, response.status_code

def post_telemetry_data(config_post, token, telemetry_data, day_str):
    """Post telemetry data in batches"""
    batch_size = config_post.get("batch_size", 100)
    total_records = len(telemetry_data)
    posted_count = 0
    failed_count = 0
    
    log(f"Posting {total_records} records for {day_str} (batch size: {batch_size})...")
    
    for i in range(0, total_records, batch_size):
        batch = telemetry_data[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total_records + batch_size - 1) // batch_size
        
        token, status_code = post_telemetry_batch(config_post, token, batch)
        
        if status_code == 200:
            posted_count += len(batch)
            log(f"  Batch {batch_num}/{total_batches}: OK {len(batch)} records posted")
        else:
            failed_count += len(batch)
            log(f"  Batch {batch_num}/{total_batches}: FAILED (HTTP {status_code})")
    
    if failed_count == 0:
        log(f"SUCCESS: All {posted_count} records posted for {day_str}")
        return True, token
    else:
        log(f"WARNING: Posted {posted_count}/{total_records} records for {day_str} ({failed_count} failed)")
        return False, token

def sync_daily(cli_limit=None, cli_batch_size=None):
    start_time_overall = time.time()
    
    log("=" * 60)
    log("Starting Telemetry Migration")
    log("=" * 60)
    
    # Load configs
    config_get = load_config(CONFIG_GET_PATH, DEFAULT_CONFIG_GET)
    config_post = load_config(CONFIG_POST_PATH, DEFAULT_CONFIG_POST)
    
    # Apply CLI arguments (these take precedence over config files)
    if cli_limit is not None:
        config_get["limit"] = cli_limit
    if cli_batch_size is not None:
        config_post["batch_size"] = cli_batch_size
    
    # Show credentials confirmation
    log("\n📋 Credentials Configuration:")
    log("-" * 60)
    
    # Get token & show username
    log("\n[GET] Fetching credentials...")
    token_get = ensure_token(config_get["url"], config_get["cred"], config_get["token"], config_get["refresh_token"])
    if not token_get:
        log("ERROR: Authentication token (GET) not available")
        return
    
    # Load and show GET username
    try:
        with open(config_get["cred"], "r") as f:
            get_username = f.read().strip()
        log(f"GET account: {get_username}")
    except:
        log("GET account: (unable to read)")
    
    # Post token & show username
    log("\n[POST] Fetching credentials...")
    token_post = ensure_token(config_post["url"], config_post["cred"], config_post["token"], config_post["refresh_token"])
    if not token_post:
        log("ERROR: Authentication token (POST) not available")
        return
    
    # Load and show POST username
    try:
        with open(config_post["cred"], "r") as f:
            post_username = f.read().strip()
        log(f"POST account: {post_username}")
    except:
        log("POST account: (unable to read)")
    
    log("\n" + "-" * 60)
    
    # Confirm before proceeding
    confirm = input("\nProceed with migration? (y/n): ").strip().lower()
    if confirm not in {"y", "yes"}:
        log("Migration cancelled by user")
        return
    
    # Use GET token
    token = token_get
    
    # Parse date range
    start_dt = pd.to_datetime(config_get["start_time"], format="%d/%m/%Y %H:%M:%S")
    end_dt = pd.to_datetime(config_get["end_time"], format="%d/%m/%Y %H:%M:%S")
    
    # Timezone handling
    start_dt_utc = start_dt.tz_localize('UTC')
    end_dt_utc = end_dt.tz_localize('UTC')
    
    start_date = start_dt_utc.date()
    end_date = end_dt_utc.date()
    
    log(f"Date range: {start_date} to {end_date}")
    log(f"Limit per day: {config_get['limit']}")
    log(f"Batch size: {config_post['batch_size']}")
    log(f"Entity: {config_get['entity_name']} ({config_get['entity_id']})")
    log("-" * 60)
    
    current_date = start_date
    total_records_fetched = 0
    total_records_posted = 0
    total_days = 0
    successful_days = 0
    
    # Store post config entity_id from get config if not set
    if not config_post.get("entity_id"):
        config_post["entity_id"] = config_get["entity_id"]
    
    while current_date <= end_date:
        # Set time range for this day
        if current_date == start_date:
            day_start = start_dt_utc
        else:
            day_start = pd.to_datetime(f"{current_date} 00:00:00", format="%Y-%m-%d %H:%M:%S").tz_localize('UTC')
        
        if current_date == end_date:
            day_end = end_dt_utc
        else:
            day_end = pd.to_datetime(f"{current_date} 23:59:59", format="%Y-%m-%d %H:%M:%S").tz_localize('UTC')
        
        day_str = current_date.strftime("%Y%m%d")
        total_days += 1
        
        log(f"\n[Day {total_days}] Processing {day_str}...")
        
        # Fetch data with retry
        result = fetch_daily_data(config_get, token, day_start, day_end, max_retries=3)
        
        if result is None:
            log(f"FAILED: Skipping {day_str}")
            current_date += timedelta(days=1)
            continue
        
        token, data = result
        
        if data is None:
            log(f"INFO: No data for {day_str}, moving to next day")
            current_date += timedelta(days=1)
            continue
        
        # Transform and save temp file
        temp_file, record_count = transform_and_save_temp_data(data, config_get["entity_name"])
        total_records_fetched += record_count
        
        log(f"Temp file saved: {temp_file}")
        
        # Load temp file for posting
        with open(temp_file, 'r') as f:
            telemetry_data = json.load(f)
        
        # Post data (use POST token and config)
        post_success, token_post = post_telemetry_data(config_post, token_post, telemetry_data, day_str)
        
        if post_success:
            total_records_posted += record_count
            successful_days += 1
            # Delete temp file after successful post
            try:
                os.remove(temp_file)
                log(f"Temp file deleted: {temp_file}")
            except Exception as e:
                log(f"WARNING: Failed to delete temp file: {e}")
        else:
            log(f"WARNING: Temp file kept for manual review: {temp_file}")
        
        current_date += timedelta(days=1)
    
    # Summary
    elapsed_time = time.time() - start_time_overall
    log("\n" + "=" * 60)
    log("Migration Complete")
    log("=" * 60)
    log(f"Total days processed: {total_days}")
    log(f"Successful days: {successful_days}")
    log(f"Total records fetched: {total_records_fetched}")
    log(f"Total records posted: {total_records_posted}")
    log(f"⏱️  Total time: {elapsed_time:.2f} seconds")
    log("=" * 60)

if __name__ == "__main__":
    cli_limit = None
    cli_batch_size = None
    
    if len(sys.argv) > 1:
        try:
            cli_limit = int(sys.argv[1])
        except ValueError:
            print("Invalid limit. Usage: py .\\migrate_telemetry.py [limit] [batch_size]")
            raise SystemExit(1)
    
    if len(sys.argv) > 2:
        try:
            cli_batch_size = int(sys.argv[2])
        except ValueError:
            print("Invalid batch size. Usage: py .\\migrate_telemetry.py [limit] [batch_size]")
            raise SystemExit(1)
    
    sync_daily(cli_limit, cli_batch_size)
