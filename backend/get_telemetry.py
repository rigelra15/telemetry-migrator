import requests
import json
import pandas as pd
import os
import sys
import time
from auth_utils import ensure_token, handle_unauthorized
from datetime import datetime, timedelta, timezone

CONFIG_PATH = "config/config_get.json"
DEFAULT_CONFIG = {
    "url" : "https://flexiot.xlsmart.co.id",
    "entity_name": "PWSS-IDM-03",
    "entity_id": "5bf9fc50-70fa-11f0-8e7f-3d041346deb6",
    "entity_type": "ASSET",
    "cred": "auth/credentials.txt",
    "token": "auth/token.txt",
    "refresh_token": "auth/refreshToken.txt",
    "keys": None,
    "keys_file": "config/keys.txt",
    "start_time": "01/11/2025 00:00:00", # DD/MM/YYYY HH:MM:SS
    "end_time": "10/11/2025 22:48:10", # DD/MM/YYYY HH:MM:SS
    "interval": 0,
    "limit": 100,
    "use_strict_data_types": False,
    "sort_by": "ASC" # ASC | DESC
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

    

def load_keys():
    """Load telemetry keys from file or CONFIG"""
    if CONFIG.get("keys"):
        return CONFIG["keys"]

    keys_path = CONFIG.get("keys_file")
    if not keys_path:
        return []

    try:
        with open(keys_path, "r") as file:
            # Support comma-separated or one key per line.
            raw = file.read()
            if "," in raw:
                keys = [k.strip() for k in raw.split(",")]
            else:
                keys = [line.strip() for line in raw.splitlines()]
            return [k for k in keys if k]
    except FileNotFoundError:
        print(f"Keys file not found: {keys_path}")
        return []

def transform_and_save_data(data, entity_name, start_time, end_time):
    """Transform API response to grouped format and save to JSON file"""
    # Dictionary to group data by timestamp
    grouped_data = {}
    
    # Process each key in the response
    for key, values in data.items():
        for item in values:
            ts = item['ts']
            value = item['value']
            
            # Initialize timestamp entry if not exists
            if ts not in grouped_data:
                # Use timezone-aware UTC datetime to avoid deprecation warning.
                ts_utc = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                ts_readable = ts_utc.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + " UTC"
                ts_readable_wib = (ts_utc + timedelta(hours=7)).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + " WIB"
                grouped_data[ts] = {
                    "number": len(grouped_data) + 1,
                    "ts": ts,
                    "ts_readable": ts_readable,
                    "ts_readable_wib": ts_readable_wib,
                    "values": {}
                }
            
            # Add value to the timestamp group
            grouped_data[ts]["values"][key] = value
    
    # Convert to sorted list by timestamp
    result = sorted(grouped_data.values(), key=lambda x: x['ts'])
    # Assign sequential numbers after sorting
    for i, item in enumerate(result, start=1):
        item["number"] = i
    
    # Create output directory if it doesn't exist
    output_dir = "output/json"
    os.makedirs(output_dir, exist_ok=True)
    
    # Format start and end times for filename
    start_formatted = datetime.strptime(start_time, "%d/%m/%Y %H:%M:%S").strftime("%Y%m%d-%H%M%S")
    end_formatted = datetime.strptime(end_time, "%d/%m/%Y %H:%M:%S").strftime("%Y%m%d-%H%M%S")
    filename = f"{output_dir}/{entity_name}_{start_formatted}_{end_formatted}_{CONFIG['limit']}.json"
    
    # Save to JSON file
    with open(filename, 'w') as f:
        json.dump(result, f, indent=4)
    
    print(f"Data saved to: {filename}")
    print(f"Total records: {len(result)}")
    
    return result

def save_summary(key_counts, entity_name, start_time, end_time):
    """Save a text summary with per-key counts"""
    output_dir = "output/summary"
    os.makedirs(output_dir, exist_ok=True)

    start_formatted = datetime.strptime(start_time, "%d/%m/%Y %H:%M:%S").strftime("%Y%m%d-%H%M%S")
    end_formatted = datetime.strptime(end_time, "%d/%m/%Y %H:%M:%S").strftime("%Y%m%d-%H%M%S")
    filename = f"{output_dir}/{entity_name}_{start_formatted}_{end_formatted}_{CONFIG['limit']}_summary.txt"

    # Check keys that reached limit
    keys_at_limit = [key for key, count in key_counts.items() if count >= CONFIG['limit']]
    
    with open(filename, "w") as file:
        total_keys = len(key_counts)
        total_points = sum(key_counts.values())
        file.write(f"Entity: {entity_name}\n")
        file.write(f"Start: {start_time}\n")
        file.write(f"End: {end_time}\n")
        file.write(f"Limit: {CONFIG['limit']}\n")
        file.write(f"Total keys: {total_keys}\n")
        file.write(f"Total points: {total_points}\n")
        file.write(f"Keys reached limit: {len(keys_at_limit)}\n")
        if keys_at_limit:
            file.write(f"  (keys: {', '.join(keys_at_limit)})\n")
        file.write("---\n")
        file.write("Per-key counts (A-Z):\n")
        for key in sorted(key_counts.keys()):
            file.write(f"- {key}: {key_counts[key]}\n")
        file.write("---\n")
        file.write("Per-key counts (smallest first):\n")
        for key, count in sorted(key_counts.items(), key=lambda item: (item[1], item[0])):
            file.write(f"- {key}: {count}\n")

    print(f"Summary saved to: {filename}")

def check_limit_warnings(key_counts, limit):
    """Check if any key hit the limit and warn user"""
    keys_at_limit = [key for key, count in key_counts.items() if count >= limit]
    
    if keys_at_limit:
        print("\n⚠️  WARNING: Some keys may be truncated (reached limit):")
        for key in keys_at_limit:
            print(f"   - {key}: {key_counts[key]} (hit limit)")
        print(f"→ Try increasing limit (current: {limit}) and run again\n")
        return True
    return False

def get_timeseries():
    start_time = time.time()
    
    token = ensure_token(CONFIG["url"], CONFIG["cred"], CONFIG["token"], CONFIG["refresh_token"])
    if not token:
        print("Authentication token not available")
        return

    keys = load_keys()
    if not keys:
        print("Telemetry keys not available")
        return
    
    # Ask user for timezone
    print(f"\nStart time: {CONFIG['start_time']}")
    print(f"End time: {CONFIG['end_time']}")
    print("\nChoose timezone for these times:")
    print("1) UTC")
    print("2) GMT+7 (auto detect)")
    print("3) Custom timezone")
    
    tz_choice = input("Enter choice (1/2/3) [default: 1]: ").strip()
    if not tz_choice:
        tz_choice = "1"
    
    url = f"{CONFIG['url']}/api/plugins/telemetry/{CONFIG['entity_type']}/{CONFIG['entity_id']}/values/timeseries"
    headers = {
        "X-Authorization": f"Bearer {token}"
    }
    # Convert datetime strings to UTC milliseconds
    start_dt = pd.to_datetime(CONFIG["start_time"], format="%d/%m/%Y %H:%M:%S")
    end_dt = pd.to_datetime(CONFIG["end_time"], format="%d/%m/%Y %H:%M:%S")
    
    # Handle timezone based on user choice
    if tz_choice == "2":
        # Auto-detect system timezone
        try:
            import tzlocal
            local_tz = tzlocal.get_localzone()
            start_dt_local = start_dt.tz_localize(local_tz)
            end_dt_local = end_dt.tz_localize(local_tz)
            start_dt_utc = start_dt_local.tz_convert('UTC')
            end_dt_utc = end_dt_local.tz_convert('UTC')
            
            # Calculate offset for display
            offset_seconds = start_dt_local.utcoffset().total_seconds()
            offset_hours = offset_seconds / 3600
            sign = "+" if offset_hours >= 0 else ""
            print(f"Timezone: {local_tz} (GMT{sign}{offset_hours:.1f})")
            print(f"Converted to UTC:")
            print(f"  Start: {start_dt_utc.strftime('%d/%m/%Y %H:%M:%S')} UTC")
            print(f"  End:   {end_dt_utc.strftime('%d/%m/%Y %H:%M:%S')} UTC")
        except Exception as e:
            print(f"Auto-detect failed: {e}. Using UTC.")
            start_dt_utc = start_dt.tz_localize('UTC')
            end_dt_utc = end_dt.tz_localize('UTC')
    elif tz_choice == "3":
        # Custom timezone
        print("\nEnter timezone offset (e.g., -12 to +14):")
        try:
            offset = float(input("GMT offset: ").strip())
            if offset < -12 or offset > 14:
                print("Invalid offset. Using UTC.")
                start_dt_utc = start_dt.tz_localize('UTC')
                end_dt_utc = end_dt.tz_localize('UTC')
            else:
                from datetime import timezone as dt_timezone
                tz = dt_timezone(timedelta(hours=offset))
                start_dt_local = start_dt.tz_localize(tz)
                end_dt_local = end_dt.tz_localize(tz)
                start_dt_utc = start_dt_local.tz_convert('UTC')
                end_dt_utc = end_dt_local.tz_convert('UTC')
                sign = "+" if offset >= 0 else ""
                print(f"Timezone: GMT{sign}{offset}")
                print(f"Converted to UTC:")
                print(f"  Start: {start_dt_utc.strftime('%d/%m/%Y %H:%M:%S')} UTC")
                print(f"  End:   {end_dt_utc.strftime('%d/%m/%Y %H:%M:%S')} UTC")
        except ValueError:
            print("Invalid input. Using UTC.")
            start_dt_utc = start_dt.tz_localize('UTC')
            end_dt_utc = end_dt.tz_localize('UTC')
    else:
        # Default to UTC
        start_dt_utc = start_dt.tz_localize('UTC')
        end_dt_utc = end_dt.tz_localize('UTC')
        print(f"Timezone: UTC")
    
    params = {
        "keys": ",".join(keys),
        "startTs": int(start_dt_utc.timestamp() * 1000),
        "endTs": int(end_dt_utc.timestamp() * 1000),
        "interval": CONFIG["interval"],
        "useStrictDataTypes": CONFIG["use_strict_data_types"],
        "orderBy": CONFIG["sort_by"],
        "limit": CONFIG["limit"]
    }
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 401:
        token = handle_unauthorized(CONFIG["url"], CONFIG["cred"], CONFIG["token"], CONFIG["refresh_token"])
        if not token:
            return
        headers["X-Authorization"] = f"Bearer {token}"
        response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        data = response.json()
        print("Status: download success")

        # Save per-key counts to summary file without printing to terminal.
        key_counts = {key: len(values) for key, values in data.items()}
        if key_counts:
            save_summary(key_counts, CONFIG["entity_name"], CONFIG["start_time"], CONFIG["end_time"])

        # Transform and save data
        transform_and_save_data(data, CONFIG["entity_name"], CONFIG["start_time"], CONFIG["end_time"])
        print("Status: output saved")
        
        # Print elapsed time
        elapsed_time = time.time() - start_time
        print(f"⏱️  Process completed in {elapsed_time:.2f} seconds")
    else:
        print(f"Status: failed (HTTP {response.status_code})")
        elapsed_time = time.time() - start_time
        print(f"⏱️  Process completed in {elapsed_time:.2f} seconds")
        
if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            CONFIG["limit"] = int(sys.argv[1])
        except ValueError:
            print("Invalid limit. Usage: py .\\get_telemetry.py [limit]")
            raise SystemExit(1)
    get_timeseries()