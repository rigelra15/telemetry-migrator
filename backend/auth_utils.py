import getpass
import os
import requests


def load_token(token_path):
    """Load authentication token from file"""
    try:
        with open(token_path, "r") as file:
            return file.read().strip()
    except FileNotFoundError:
        print(f"Token file not found: {token_path}")
        return None


def save_token(token_path, token):
    os.makedirs(os.path.dirname(token_path), exist_ok=True)
    with open(token_path, "w") as file:
        file.write(token)


def load_refresh_token(refresh_token_path):
    try:
        with open(refresh_token_path, "r") as file:
            return file.read().strip()
    except FileNotFoundError:
        return None


def save_refresh_token(refresh_token_path, refresh_token):
    os.makedirs(os.path.dirname(refresh_token_path), exist_ok=True)
    with open(refresh_token_path, "w") as file:
        file.write(refresh_token)


def load_username(credentials_path):
    try:
        with open(credentials_path, "r") as file:
            return file.read().strip()
    except FileNotFoundError:
        return None


def save_username(credentials_path, username):
    os.makedirs(os.path.dirname(credentials_path), exist_ok=True)
    with open(credentials_path, "w") as file:
        file.write(username)


def prompt_login(base_url, credentials_path, token_path, refresh_token_path):
    """Prompt for username/password and request a new token"""
    username = input("Username: ").strip()
    password = getpass.getpass("Password: ")
    if not username or not password:
        print("Username/password cannot be empty")
        return None

    url = f"{base_url}/api/auth/login"
    response = requests.post(url, json={"username": username, "password": password})
    if response.status_code != 200:
        print(f"Login failed (HTTP {response.status_code})")
        return None

    data = response.json()
    token = data.get("token")
    refresh_token = data.get("refreshToken")
    if not token or not refresh_token:
        print("Login failed: token/refreshToken not found")
        return None

    save_username(credentials_path, username)
    save_token(token_path, token)
    save_refresh_token(refresh_token_path, refresh_token)
    return token


def refresh_access_token(base_url, token_path, refresh_token_path):
    """Refresh access token using refresh token"""
    refresh_value = load_refresh_token(refresh_token_path)
    if not refresh_value:
        print("Refresh token not available")
        return None

    url = f"{base_url}/api/auth/token"
    response = requests.post(url, json={"refreshToken": refresh_value})
    if response.status_code != 200:
        print(f"Refresh token failed (HTTP {response.status_code})")
        return None

    data = response.json()
    token = data.get("token")
    refresh_value = data.get("refreshToken", refresh_value)
    if not token:
        print("Refresh token failed: token not found")
        return None

    save_token(token_path, token)
    save_refresh_token(refresh_token_path, refresh_value)
    return token


def ensure_token(base_url, credentials_path, token_path, refresh_token_path):
    # Check if username exists from previous login
    existing_username = load_username(credentials_path)
    
    if existing_username:
        print(f"\nSaved account: {existing_username}")
        change = input("Switch account? (y/n): ").strip().lower()
        if change in {"y", "yes"}:
            return prompt_login(base_url, credentials_path, token_path, refresh_token_path)
        else:
            print("Continuing with existing account...\n")
    
    # Try to use existing token
    token = load_token(token_path)
    if token:
        return token
    
    # No token, prompt for login
    return prompt_login(base_url, credentials_path, token_path, refresh_token_path)


def handle_unauthorized(base_url, credentials_path, token_path, refresh_token_path):
    print("\nToken expired/unauthorized.")
    print("a) Refresh token")
    print("b) Switch account")
    choice = input("Choose (a/b): ").strip().lower()
    
    if choice == "a":
        token = refresh_access_token(base_url, token_path, refresh_token_path)
        if token:
            return token
        print("Refresh token failed, please login again.")
    
    return prompt_login(base_url, credentials_path, token_path, refresh_token_path)
