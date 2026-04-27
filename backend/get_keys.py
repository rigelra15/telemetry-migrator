import requests
import os
import json
from auth_utils import ensure_token, handle_unauthorized

CONFIG_PATH = "config/config.json"
DEFAULT_CONFIG = {
    "url" : "https://flexiot.xlsmart.co.id",
    "entity_name": "PWSS-IDM-03",
    "entity_id": "5bf9fc50-70fa-11f0-8e7f-3d041346deb6",
    "entity_type": "ASSET",
    "cred": "auth/credentials.txt",
    "token": "auth/token.txt",
    "refresh_token": "auth/refreshToken.txt",
    "keys_file": "config/keys.txt",
    "sort_order": "ASC" # ASC | DESC
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


def get_timeseries_keys():
    token = ensure_token(CONFIG["url"], CONFIG["cred"], CONFIG["token"], CONFIG["refresh_token"])
    if not token:
        print("Authentication token not available")
        return

    url = f"{CONFIG['url']}/api/plugins/telemetry/{CONFIG['entity_type']}/{CONFIG['entity_id']}/keys/timeseries"
    headers = {
        "X-Authorization": f"Bearer {token}"
    }

    response = requests.get(url, headers=headers)
    if response.status_code == 401:
        token = handle_unauthorized(CONFIG["url"], CONFIG["cred"], CONFIG["token"], CONFIG["refresh_token"])
        if not token:
            return
        headers["X-Authorization"] = f"Bearer {token}"
        response = requests.get(url, headers=headers)
    if response.status_code == 200:
        keys = response.json()
        print("Status: download success")

        sort_order = str(CONFIG.get("sort_order", "ASC")).upper()
        if sort_order in {"ASC", "DESC"}:
            keys = sorted(keys, reverse=(sort_order == "DESC"))

        keys_path = CONFIG.get("keys_file", "config/keys.txt")
        os.makedirs(os.path.dirname(keys_path), exist_ok=True)
        filename = keys_path
        with open(filename, "w") as file:
            for key in keys:
                file.write(f"{key}\n")

        print(f"Keys saved to: {filename}")
        print(f"Total keys: {len(keys)}")
    else:
        print(f"Status: failed (HTTP {response.status_code})")
        
if __name__ == "__main__":
    get_timeseries_keys()