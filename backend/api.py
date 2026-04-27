from fastapi import FastAPI, HTTPException, BackgroundTasks
from contextlib import asynccontextmanager
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import json
import os
from datetime import datetime
from typing import Optional
import asyncio
import logging
from dotenv import load_dotenv
from entity_info import get_entity_info

# Load environment variables from .env file (only in development)
# In production, Electron passes env vars directly
if not os.getenv("BASE_URL"):
    load_dotenv()

# Setup logging
logger = logging.getLogger("migration")
logger.setLevel(logging.INFO)

# Add console handler if not already added
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    formatter = logging.Formatter('[%(levelname)s] %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("Migration API Started")
    logger.info(f"Base URL: {BASE_URL}")
    logger.info("=" * 60)
    yield

app = FastAPI(title="Telemetry Migration API", lifespan=lifespan)

# Get configuration from environment
BASE_URL = os.getenv("BASE_URL", "https://demo.thingsboard.io")

# CORS middleware untuk frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path untuk auth files
AUTH_DIR = "auth"
os.makedirs(AUTH_DIR, exist_ok=True)

# Path untuk session dan history files
DATA_DIR = "data"
SESSION_DIR = os.path.join(DATA_DIR, "session")
HISTORY_DIR = os.path.join(DATA_DIR, "history")
LOGS_DIR = os.path.join(DATA_DIR, "logs")
os.makedirs(SESSION_DIR, exist_ok=True)
os.makedirs(HISTORY_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

# Global variables untuk track migration status
migration_status = {
    "running": False,
    "progress": "",
    "completed": False,
    "error": None,
    "startTime": None,
    "currentBatch": 0,
    "totalBatches": 0,
    "eta": None
}

# Global variable for current migration log file
current_log_file = None

# ==================== HELPER FUNCTIONS ====================

def is_source_logged_in() -> bool:
    """Check if source is logged in by checking token file"""
    token_path = os.path.join(AUTH_DIR, "token_source.txt")
    return os.path.exists(token_path) and os.path.getsize(token_path) > 0

def is_destination_logged_in() -> bool:
    """Check if destination is logged in by checking token file"""
    token_path = os.path.join(AUTH_DIR, "token_destination.txt")
    return os.path.exists(token_path) and os.path.getsize(token_path) > 0

# ==================== MODELS ====================

class LoginRequest(BaseModel):
    username: str
    password: str

class MigrationRequest(BaseModel):
    # Required fields
    entityType: str
    entityId: str
    keys: str
    start: int  # milliseconds UTC (startTs)
    end: int    # milliseconds UTC (endTs)
    targetEntityType: str
    targetEntityId: str
    
    # Optional fields with defaults from Swagger
    intervalType: Optional[str] = None  # Values: MILLISECONDS, WEEK, WEEK_ISO, MONTH, QUARTER
    interval: Optional[int] = 0  # Default: 0
    timeZone: Optional[str] = None  # Timezone for interval calculations
    limit: Optional[int] = 100  # Default: 100
    agg: Optional[str] = None  # Values: MIN, MAX, AVG, SUM, COUNT, NONE
    orderBy: Optional[str] = None  # Values: ASC, DESC
    useStrictDataTypes: Optional[bool] = False  # Default: false
    batchSize: int = 100  # optional, default 100

class SessionData(BaseModel):
    """Model for session data storage"""
    data: dict

class HistoryData(BaseModel):
    """Model for history data storage"""
    history: list

# ==================== HELPER FUNCTIONS ====================

def log_with_timestamp(message: str):
    """Add timestamp to log message and append to progress + log file"""
    global current_log_file
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}\n"
    migration_status["progress"] += log_line
    
    # Also write to log file
    if current_log_file:
        try:
            with open(current_log_file, "a", encoding="utf-8") as f:
                f.write(log_line)
        except Exception as e:
            print(f"Warning: Failed to write to log file: {e}")
    
    return log_line

def calculate_eta(start_time, current_batch, total_batches):
    """Calculate estimated time to completion"""
    if current_batch == 0 or total_batches == 0:
        return None
    
    elapsed_seconds = (datetime.now() - start_time).total_seconds()
    avg_time_per_batch = elapsed_seconds / current_batch
    remaining_batches = total_batches - current_batch
    eta_seconds = avg_time_per_batch * remaining_batches
    
    # Format ETA nicely
    if eta_seconds < 60:
        return f"{int(eta_seconds)}s"
    elif eta_seconds < 3600:
        minutes = int(eta_seconds / 60)
        seconds = int(eta_seconds % 60)
        return f"{minutes}m {seconds}s"
    else:
        hours = int(eta_seconds / 3600)
        minutes = int((eta_seconds % 3600) / 60)
        return f"{hours}h {minutes}m"

def save_username(filename: str, username: str):
    """Save username to file (SECURITY: Do NOT save password)"""
    filepath = os.path.join(AUTH_DIR, filename)
    with open(filepath, "w") as f:
        f.write(username)

def save_refresh_token(filename: str, refresh_token: str):
    """Save refresh token to file"""
    filepath = os.path.join(AUTH_DIR, filename)
    with open(filepath, "w") as f:
        f.write(refresh_token)

def read_refresh_token(filename: str) -> Optional[str]:
    """Read refresh token from file"""
    filepath = os.path.join(AUTH_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return f.read().strip()
    return None

def save_token(filename: str, token: str):
    """Save token to file"""
    filepath = os.path.join(AUTH_DIR, filename)
    with open(filepath, "w") as f:
        f.write(token)

def read_token(filename: str) -> Optional[str]:
    """Read token from file"""
    filepath = os.path.join(AUTH_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return f.read().strip()
    return None

def read_username(filename: str) -> Optional[str]:
    """Read username from credentials file"""
    filepath = os.path.join(AUTH_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            lines = f.readlines()
            if lines:
                return lines[0].strip()
    return None

async def refresh_access_token(source: str) -> Optional[str]:
    """
    Refresh access token using refresh token (NOT password)
    
    Args:
        source: 'source' or 'destination'
    
    Returns:
        New access token if successful, None otherwise
    """
    try:
        # Read refresh token
        refresh_token = read_refresh_token(f"refreshToken_{source}.txt")
        if not refresh_token:
            return None
        
        # Call ThingsBoard refresh token endpoint
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            response = await client.post(
                f"{BASE_URL}/api/auth/token",
                json={"refreshToken": refresh_token}
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            new_token = data.get("token")
            new_refresh_token = data.get("refreshToken")
            
            if new_token:
                save_token(f"token_{source}.txt", new_token)
            if new_refresh_token:
                save_refresh_token(f"refreshToken_{source}.txt", new_refresh_token)
            
            return new_token
    except Exception as e:
        print(f"Failed to refresh token for {source}: {e}")
        return None

async def login_to_thingsboard(base_url: str, username: str, password: str) -> dict:
    """Login to ThingsBoard and return token + refreshToken"""
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        response = await client.post(
            f"{base_url}/api/auth/login",
            json={"username": username, "password": password}
        )
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Login failed")
        
        data = response.json()
        return {
            "token": data.get("token"),
            "refreshToken": data.get("refreshToken")
        }

def transform_data(data: dict) -> list:
    """Transform telemetry data to required format
    
    Accepts all value types (numbers, strings, etc.) just like CLI version
    """
    result = {}
    for key in data:
        for entry in data[key]:
            ts = entry["ts"]
            if ts not in result:
                result[ts] = {"ts": ts, "values": {}}
            
            # Keep value as-is (string, number, etc.) - don't force convert to float
            # ThingsBoard API accepts mixed data types
            result[ts]["values"][key] = entry["value"]
    
    return list(result.values())

# ==================== ENDPOINTS ====================



@app.get("/")
async def root():
    return {"message": "Telemetry Migration API", "status": "running"}

@app.get("/api/config")
async def get_config():
    """Get frontend configuration"""
    return {
        "baseURL": BASE_URL
    }

@app.get("/api/auth/status")
async def get_auth_status():
    """Get authentication status for both source and destination"""
    source_logged_in = is_source_logged_in()
    dest_logged_in = is_destination_logged_in()
    
    return {
        "sourceLoggedIn": source_logged_in,
        "destLoggedIn": dest_logged_in,
        "bothLoggedIn": source_logged_in and dest_logged_in,
        "sourceUsername": read_username("credentials_source.txt") if source_logged_in else None,
        "destUsername": read_username("credentials_destination.txt") if dest_logged_in else None
    }

@app.post("/api/login/source")
async def login_source(request: LoginRequest):
    """Login to source system and save credentials (username only, NOT password)"""
    try:
        # Login and get tokens
        auth_data = await login_to_thingsboard(BASE_URL, request.username, request.password)
        
        # Save ONLY username (SECURITY: do NOT save password)
        save_username("credentials_source.txt", request.username)
        save_token("token_source.txt", auth_data["token"])
        save_refresh_token("refreshToken_source.txt", auth_data["refreshToken"])
        
        return {
            "success": True,
            "message": "Source login successful",
            "token": auth_data["token"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/login/destination")
async def login_destination(request: LoginRequest):
    """Login to destination system and save credentials (username only, NOT password)"""
    try:
        # Login and get tokens
        auth_data = await login_to_thingsboard(BASE_URL, request.username, request.password)
        
        # Save ONLY username (SECURITY: do NOT save password)
        save_username("credentials_destination.txt", request.username)
        save_token("token_destination.txt", auth_data["token"])
        save_refresh_token("refreshToken_destination.txt", auth_data["refreshToken"])
        
        return {
            "success": True,
            "message": "Destination login successful",
            "token": auth_data["token"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/refresh/{source}")
async def refresh_token_endpoint(source: str):
    """
    Refresh access token using refresh token
    
    Args:
        source: 'source' or 'destination'
    
    Returns:
        New access token or error
    """
    if source not in ["source", "destination"]:
        raise HTTPException(status_code=400, detail="Invalid source. Must be 'source' or 'destination'")
    
    try:
        new_token = await refresh_access_token(source)
        if not new_token:
            raise HTTPException(
                status_code=401, 
                detail="Failed to refresh token. Please login again."
            )
        
        return {
            "success": True,
            "message": f"{source.capitalize()} token refreshed successfully",
            "token": new_token
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")

@app.post("/api/auth/logout/{source}")
async def logout_endpoint(source: str):
    """
    Logout and clear credentials
    
    Args:
        source: 'source' or 'destination'
    
    Returns:
        Success message
    """
    if source not in ["source", "destination"]:
        raise HTTPException(status_code=400, detail="Invalid source. Must be 'source' or 'destination'")
    
    try:
        # Delete credential files
        for filename in [f"credentials_{source}.txt", f"token_{source}.txt", f"refreshToken_{source}.txt"]:
            filepath = os.path.join(AUTH_DIR, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
        
        return {
            "success": True,
            "message": f"{source.capitalize()} logout successful"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")

@app.get("/api/status")
async def get_status():
    """Get migration status"""
    return migration_status

@app.get("/api/keys")
async def get_keys(entityType: str, entityId: str):
    """Get available timeseries keys for an entity"""
    try:
        # Read source token
        source_token = read_token("token_source.txt")
        if not source_token:
            raise HTTPException(status_code=401, detail="Please login to source system first")
        
        # Fetch keys from ThingsBoard
        url = f"{BASE_URL}/api/plugins/telemetry/{entityType}/{entityId}/keys/timeseries"
        headers = {"X-Authorization": f"Bearer {source_token}"}
        
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code == 401:
                # Try refreshing token
                print("Source token expired for /api/keys, attempting refresh...")
                new_token = await refresh_access_token("source")
                
                if new_token:
                    # Retry with new token
                    headers = {"X-Authorization": f"Bearer {new_token}"}
                    response = await client.get(url, headers=headers)
                    
                    if response.status_code != 200:
                        raise HTTPException(
                            status_code=response.status_code,
                            detail=f"Failed to fetch keys after token refresh: {response.text}"
                        )
                else:
                    raise HTTPException(status_code=401, detail="Session expired and refresh failed. Please login again.")
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"Failed to fetch keys: {response.text}"
                )
            
            keys = response.json()
            # Sort keys alphabetically
            keys = sorted(keys)
            
            return {
                "success": True,
                "keys": keys,
                "total": len(keys)
            }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/entity/info")
async def get_entity_info_endpoint(entityType: str, entityId: str, source: str = "source"):
    """
    Get entity information (name, type, etc.) from ThingsBoard
    
    Args:
        entityType: Type of entity (ASSET or DEVICE)
        entityId: UUID of the entity
        source: Which token to use ('source' or 'destination')
    """
    try:
        # Read appropriate token
        token_file = f"token_{source}.txt"
        token = read_token(token_file)
        
        if not token:
            raise HTTPException(status_code=401, detail=f"{source.capitalize()} not logged in")
        
        # Fetch entity info using the helper function
        entity_info = await get_entity_info(entityType, entityId, token, BASE_URL)
        return entity_info
        
    except HTTPException as e:
        # If 401, try refreshing token
        if e.status_code == 401:
            print(f"Token expired for {source}, attempting refresh...")
            new_token = await refresh_access_token(source)
            
            if new_token:
                # Retry with new token
                try:
                    entity_info = await get_entity_info(entityType, entityId, new_token, BASE_URL)
                    return entity_info
                except Exception as retry_error:
                    print(f"Retry failed after token refresh: {retry_error}")
                    raise HTTPException(status_code=500, detail=f"Retry failed: {str(retry_error)}")
            else:
                raise HTTPException(status_code=401, detail=f"{source.capitalize()} token expired and refresh failed")
        else:
            # Re-raise other HTTP exceptions
            raise
    except Exception as e:
        print(f"Unexpected error in get_entity_info_endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def run_migration(params: MigrationRequest):
    """Background task untuk menjalankan migration"""
    global migration_status, current_log_file
    
    migration_status["running"] = True
    migration_status["progress"] = ""
    migration_status["completed"] = False
    migration_status["error"] = None
    migration_status["startTime"] = datetime.now()
    migration_status["currentBatch"] = 0
    migration_status["totalBatches"] = 0
    migration_status["eta"] = None
    
    # Create log file for this migration run
    log_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    entity_short = params.entityId[:8] if params.entityId else "unknown"
    log_filename = f"migration_{log_timestamp}_{params.entityType}_{entity_short}.log"
    current_log_file = os.path.join(LOGS_DIR, log_filename)
    migration_status["logFile"] = log_filename
    
    log_with_timestamp("Initializing migration...")
    log_with_timestamp(f"Entity: {params.entityType}/{params.entityId}")
    
    print("\n" + "=" * 70)
    print("MIGRATION STARTING - DEBUG MODE")
    print("=" * 70)
    print(f"Entity Type: {params.entityType}")
    print(f"Entity ID: {params.entityId}")
    print(f"Target Entity ID: {params.targetEntityId}")
    print(f"Keys: '{params.keys}'")
    print(f"Keys type: {type(params.keys)}")
    print(f"Keys length: {len(params.keys)}")
    print(f"Limit: {params.limit}")
    print(f"Batch Size: {params.batchSize}")
    print(f"Start (ms): {params.start}")
    print(f"End (ms): {params.end}")
    print("=" * 70 + "\n")
    import sys
    sys.stdout.flush()
    logger.info(f"Date Range: {params.start} - {params.end}")
    logger.info("=" * 70)
    
    log_with_timestamp("")
    log_with_timestamp("Cleaning keys format...")
    
    # Handle both newline-separated and comma-separated with spaces
    if '\n' in params.keys:
        # Newline-separated (from file upload)
        keys_list = [k.strip() for k in params.keys.splitlines() if k.strip()]
        log_with_timestamp(f"   Converted {len(keys_list)} keys from newline format")
    else:
        # Comma-separated with possible spaces (from web input)
        keys_list = [k.strip() for k in params.keys.split(',') if k.strip()]
        log_with_timestamp(f"   Cleaned {len(keys_list)} keys (removed spaces)")
    
    # Join with comma only (no spaces!)
    params.keys = ",".join(keys_list)
    
    keys_sample = params.keys[:100] if len(params.keys) > 100 else params.keys
    log_with_timestamp(f"   Final format: '{keys_sample}...'")
    log_with_timestamp(f"   Total keys: {len(keys_list)}")
    log_with_timestamp("")
    
    log_with_timestamp("="*60)
    log_with_timestamp("Starting Telemetry Migration")
    log_with_timestamp("="*60)
    log_with_timestamp("Reading authentication tokens...")
    
    try:
        # Read tokens
        source_token = read_token("token_source.txt")
        dest_token = read_token("token_destination.txt")
        
        log_with_timestamp("Tokens loaded successfully")
        
        if not source_token or not dest_token:
            raise Exception("Tokens not found. Please login first.")
        
        # Show credentials
        log_with_timestamp("")
        log_with_timestamp("Credentials Configuration:")
        log_with_timestamp("-"*60)
        
        source_username = read_username("credentials_source.txt") or "(unknown)"
        dest_username = read_username("credentials_destination.txt") or "(unknown)"
        
        log_with_timestamp("")
        log_with_timestamp("[GET] Source credentials:")
        log_with_timestamp(f"GET account: {source_username}")
        log_with_timestamp("")
        log_with_timestamp("[POST] Destination credentials:")
        log_with_timestamp(f"POST account: {dest_username}")
        log_with_timestamp("")
        log_with_timestamp("-"*60)
        
        # Fetch entity names
        async with httpx.AsyncClient(timeout=30.0, verify=False) as temp_client:
            try:
                source_entity_info = await get_entity_info(params.entityType, params.entityId, source_token, BASE_URL)
                source_entity_name = source_entity_info.get("name", params.entityId[:8] + "...")
            except:
                source_entity_name = params.entityId[:8] + "..."
            
            try:
                dest_entity_info = await get_entity_info(params.targetEntityType, params.targetEntityId, dest_token, BASE_URL)
                dest_entity_name = dest_entity_info.get("name", params.targetEntityId[:8] + "...")
            except:
                dest_entity_name = params.targetEntityId[:8] + "..."
        
        ONE_DAY = 86400000  # 1 day in milliseconds
        BATCH_SIZE = params.batchSize  # Use batchSize from request
        
        start = params.start
        end = params.end
        
        # Calculate date range
        start_date = datetime.fromtimestamp(start / 1000)
        end_date = datetime.fromtimestamp(end / 1000)
        
        log_with_timestamp("")
        log_with_timestamp(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        log_with_timestamp(f"Limit per request: {params.limit}")
        log_with_timestamp(f"Batch size: {BATCH_SIZE}")
        log_with_timestamp(f"Source Entity: {source_entity_name} ({params.entityId})")
        log_with_timestamp(f"Target Entity: {dest_entity_name} ({params.targetEntityId})")
        log_with_timestamp("-"*60)
        log_with_timestamp("Starting day-by-day migration process...")
        
        # Day-by-day processing
        current_day_start = start
        day_count = 0
        successful_days = 0
        total_records_fetched = 0
        total_records_posted = 0
        
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            while current_day_start < end:
                day_count += 1
                day_end = min(current_day_start + ONE_DAY, end)
                
                day_date = datetime.fromtimestamp(current_day_start / 1000)
                day_str = day_date.strftime("%Y%m%d")
                day_time_start = day_date.strftime("%H:%M:%S")
                # For display: only subtract 1ms for full days so they show 23:59:59 instead of next day's 00:00:00
                # For partial days (e.g. last day ending at 12:09:00), show the actual end time
                is_full_day = (day_end == current_day_start + ONE_DAY)
                day_end_display = datetime.fromtimestamp((day_end - 1) / 1000) if is_full_day else datetime.fromtimestamp(day_end / 1000)
                day_time_end = day_end_display.strftime("%H:%M:%S")
                
                log_with_timestamp("")
                log_with_timestamp(f"[Day {day_count}] Processing {day_str} {day_time_start}-{day_time_end}...")
                
                # Fetch with retry (max 3 attempts)
                max_retries = 3
                fetch_success = False
                transformed = None
                
                for attempt in range(1, max_retries + 1):
                    log_with_timestamp(f"Fetching data ({day_date.strftime('%Y-%m-%d')}) - Attempt {attempt}/{max_retries}...")
                    
                    # # DEBUG: Show fetch params in web log
                    # if attempt == 1:  # Only show on first attempt
                    #     log_with_timestamp(f"API Request Debug:")
                    #     log_with_timestamp(f"   Keys sample: '{params.keys[:100]}...'")
                    #     log_with_timestamp(f"   interval: 0")
                    #     log_with_timestamp(f"   limit: {params.limit}")
                    
                    try:
                        # Get telemetry from source
                        fetch_params = {
                            "keys": params.keys,
                            "startTs": current_day_start,
                            "endTs": day_end,
                            "limit": params.limit or 100
                        }
                        
                        # Add optional parameters if provided
                        if params.intervalType:
                            fetch_params["intervalType"] = params.intervalType
                        if params.interval is not None:
                            fetch_params["interval"] = params.interval
                        if params.timeZone:
                            fetch_params["timeZone"] = params.timeZone
                        if params.agg:
                            fetch_params["agg"] = params.agg
                        if params.orderBy:
                            fetch_params["orderBy"] = params.orderBy
                        else:
                            fetch_params["orderBy"] = "ASC"  # Default to ASC
                        if params.useStrictDataTypes is not None:
                            fetch_params["useStrictDataTypes"] = params.useStrictDataTypes
                        
                        # # DEBUG: Log request details
                        # print(f"\n{'='*70}")
                        # print(f"[🔍 DEBUG] FETCH ATTEMPT {attempt}/{max_retries}")
                        # print(f"[🔍 DEBUG] Entity: {params.entityType}/{params.entityId}")
                        # print(f"[🔍 DEBUG] Date: {day_date.strftime('%Y-%m-%d')}")
                        # print(f"[🔍 DEBUG] Keys value: '{params.keys[:200]}...' (showing first 200 chars)")
                        # print(f"[🔍 DEBUG] Keys type: {type(params.keys).__name__}, length: {len(params.keys)}")
                        # print(f"[🔍 DEBUG] Has newlines? {'YES ❌' if chr(10) in params.keys else 'NO ✅'}")
                        # print(f"[🔍 DEBUG] Has commas? {'YES ✅' if ',' in params.keys else 'NO ❌'}")
                        # print(f"[🔍 DEBUG] First 5 keys split by comma: {params.keys.split(',')[:5] if ',' in params.keys else 'N/A'}")
                        # print(f"[🔍 DEBUG] fetch_params['interval'] = {fetch_params.get('interval')}")
                        # print(f"{'='*70}\n")
                        # import sys
                        # sys. stdout.flush()
                        
                        response = await client.get(
                            f"{BASE_URL}/api/plugins/telemetry/{params.entityType}/{params.entityId}/values/timeseries",
                            headers={"X-Authorization": f"Bearer {source_token}"},
                            params=fetch_params
                        )
                        
                        # # Print actual URL sent (with query string)
                        # print(f"[🔍 DEBUG] Actual URL sent: {response.request.url}")
                        # sys.stdout.flush()
                        
                        # # DEBUG: Log response
                        # print(f"[🔍 DEBUG] Response status: {response.status_code}")
                        # if response.status_code == 200:
                        #     data = response.json()
                        #     total_raw_records = sum(len(v) for v in data.values()) if data else 0
                        #     print(f"[✅ DEBUG] Total RAW records from API: {total_raw_records}")
                        #     print(f"[✅ DEBUG] Number of keys in response: {len(data.keys()) if data else 0}")
                        #     if data:
                        #         sample_key = list(data.keys())[0]
                        #         print(f"[✅ DEBUG] Sample key '{sample_key}': {len(data[sample_key])} records")
                        #         # Show first record timestamp for verification
                        #         if len(data[sample_key]) > 0:
                        #             first_ts = data[sample_key][0].get('ts', 'N/A')
                        #             print(f"[✅ DEBUG] First record timestamp: {first_ts}")
                        # print(f"{'='*70}\n")
                        # import sys
                        # sys.stdout.flush()
                        
                        # Handle 401 by refreshing source token
                        if response.status_code == 401:
                            log_with_timestamp("WARNING: Source token expired, refreshing...")
                            new_source_token = await refresh_access_token("source")
                            if new_source_token:
                                source_token = new_source_token
                                # Retry request with new token
                                response = await client.get(
                                    f"{BASE_URL}/api/plugins/telemetry/{params.entityType}/{params.entityId}/values/timeseries",
                                    headers={"X-Authorization": f"Bearer {source_token}"},
                                    params={
                                        "keys": params.keys,
                                        "startTs": current_day_start,
                                        "endTs": day_end,
                                        "interval": 0,
                                        "limit": params.limit,
                                        "orderBy": "ASC",
                                        "useStrictDataTypes": False
                                    }
                                )
                                log_with_timestamp("Source token refreshed successfully")
                            else:
                                raise Exception("Source token expired and refresh failed")
                        
                        if response.status_code == 200:
                            data = response.json()
                            if data:
                                # Calculate total records
                                record_count = sum(len(v) for v in data.values())
                                log_with_timestamp(f"SUCCESS: Fetched data for {day_date.strftime('%Y-%m-%d')} ({record_count} records)")
                                
                                # Transform data (keep all values as-is, including strings)
                                transformed = transform_data(data)
                                total_records_fetched += len(transformed)
                                fetch_success = True
                                break
                            else:
                                log_with_timestamp(f"INFO: No data found for {day_date.strftime('%Y-%m-%d')}")
                                fetch_success = True
                                break
                        else:
                            log_with_timestamp(f"WARNING: Fetch failed (HTTP {response.status_code}) - Retrying...")
                            if attempt < max_retries:
                                await asyncio.sleep(2)
                            continue
                    except Exception as e:
                        log_with_timestamp(f"WARNING: Fetch error - {str(e)}")
                        if attempt < max_retries:
                            await asyncio.sleep(2)
                        continue
                
                if not fetch_success:
                    log_with_timestamp(f"ERROR: Failed to fetch data for {day_str} after {max_retries} attempts")
                    log_with_timestamp(f"FAILED: Skipping {day_str}")
                    current_day_start = day_end
                    continue
                
                # Post data in batches
                if transformed and len(transformed) > 0:
                    total_chunks = (len(transformed) + BATCH_SIZE - 1) // BATCH_SIZE
                    log_with_timestamp(f"Posting {len(transformed)} records for {day_str} (batch size: {BATCH_SIZE})...")
                    
                    # Update total batches
                    migration_status["totalBatches"] += total_chunks
                    
                    posted_count = 0
                    failed_count = 0
                    
                    for i in range(total_chunks):
                        chunk = transformed[i * BATCH_SIZE:(i + 1) * BATCH_SIZE]
                        migration_status["currentBatch"] += 1
                        batch_num = i + 1
                        
                        # Calculate ETA
                        if migration_status["startTime"]:
                            eta = calculate_eta(
                                migration_status["startTime"],
                                migration_status["currentBatch"],
                                migration_status["totalBatches"]
                            )
                            migration_status["eta"] = eta
                        
                        # Post to destination
                        post_response = await client.post(
                            f"{BASE_URL}/api/plugins/telemetry/{params.targetEntityType}/{params.targetEntityId}/timeseries/ANY",
                            headers={"X-Authorization": f"Bearer {dest_token}"},
                            json=chunk
                        )
                        
                        # Handle 401 by refreshing destination token
                        if post_response.status_code == 401:
                            log_with_timestamp("WARNING: Destination token expired, refreshing...")
                            new_dest_token = await refresh_access_token("destination")
                            if new_dest_token:
                                dest_token = new_dest_token
                                # Retry post with new token
                                post_response = await client.post(
                                    f"{BASE_URL}/api/plugins/telemetry/{params.targetEntityType}/{params.targetEntityId}/timeseries/ANY",
                                    headers={"X-Authorization": f"Bearer {dest_token}"},
                                    json=chunk
                                )
                                log_with_timestamp("Destination token refreshed successfully")
                            else:
                                raise Exception("Destination token expired and refresh failed")
                        
                        if post_response.status_code in [200, 201]:
                            posted_count += len(chunk)
                            log_with_timestamp(f"  Batch {batch_num}/{total_chunks}: OK {len(chunk)} records posted")
                        else:
                            failed_count += len(chunk)
                            log_with_timestamp(f"  Batch {batch_num}/{total_chunks}: FAILED (HTTP {post_response.status_code})")
                        
                        await asyncio.sleep(0.1)  # Small delay between chunks
                    
                    if failed_count == 0:
                        log_with_timestamp(f"SUCCESS: All {posted_count} records posted for {day_str}")
                        total_records_posted += posted_count
                        successful_days += 1
                    else:
                        log_with_timestamp(f"WARNING: Posted {posted_count}/{len(transformed)} records for {day_str} ({failed_count} failed)")
                        total_records_posted += posted_count
                else:
                    log_with_timestamp(f"INFO: No data to post for {day_str}, moving to next day")
                    successful_days += 1
                
                current_day_start = day_end
        
        # Summary
        elapsed = (datetime.now() - migration_status["startTime"]).total_seconds()
        if elapsed < 60:
            time_str = f"{int(elapsed)}s"
        elif elapsed < 3600:
            time_str = f"{int(elapsed/60)}m {int(elapsed%60)}s"
        else:
            time_str = f"{int(elapsed/3600)}h {int((elapsed%3600)/60)}m"
        
        log_with_timestamp("")
        log_with_timestamp("="*60)
        log_with_timestamp("Migration Complete")
        log_with_timestamp("="*60)
        log_with_timestamp(f"Total days processed: {day_count}")
        log_with_timestamp(f"Successful days: {successful_days}")
        log_with_timestamp(f"Total records fetched: {total_records_fetched}")
        log_with_timestamp(f"Total records posted: {total_records_posted}")
        log_with_timestamp(f"Total time: {time_str}")
        log_with_timestamp("="*60)
        
        migration_status["completed"] = True
        
    except Exception as e:
        error_msg = f"{str(e)} - {type(e).__name__}"
        migration_status["error"] = error_msg
        print(f"\n{'='*70}")
        print(f"EXCEPTION IN MIGRATION:")
        print(f"Error: {error_msg}")
        print(f"{'='*70}\n")
        import traceback
        traceback.print_exc()
        import sys
        sys.stdout.flush()
        
        log_with_timestamp("")
        log_with_timestamp("="*60)
        log_with_timestamp(f"Migration Error: {error_msg}")
        log_with_timestamp("="*60)
    finally:
        migration_status["running"] = False
        
        # Write final status to log file
        if current_log_file:
            try:
                with open(current_log_file, "a", encoding="utf-8") as f:
                    f.write(f"\n--- Migration ended at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
                    f.write(f"Status: {'Completed' if migration_status['completed'] else 'Error'}\n")
                    if migration_status['error']:
                        f.write(f"Error: {migration_status['error']}\n")
                print(f"Migration log saved to: {current_log_file}")
            except Exception as e:
                print(f"Warning: Failed to finalize log file: {e}")
        
        print(f"\nMigration FINALLY block - running={migration_status['running']}, completed={migration_status['completed']}, error={migration_status['error']}\n")
        import sys
        sys.stdout.flush()

@app.post("/api/migrate")
async def start_migration(request: MigrationRequest, background_tasks: BackgroundTasks):
    """Start migration process"""
    print(f"\n📥 /api/migrate endpoint called!")
    print(f"Request: entityType={request.entityType}, entityId={request.entityId}")
    import sys
    sys.stdout.flush()
    
    if migration_status["running"]:
        raise HTTPException(status_code=400, detail="Migration already running")
    
    # Reset status
    migration_status["running"] = False
    migration_status["progress"] = ""
    migration_status["completed"] = False
    migration_status["error"] = None
    migration_status["startTime"] = None
    migration_status["currentBatch"] = 0
    migration_status["totalBatches"] = 0
    migration_status["eta"] = None
    
    print(f"✅ Adding background task for run_migration...")
    sys.stdout.flush()
    
    # Start migration in background
    background_tasks.add_task(run_migration, request)
    
    print(f"✅ Background task added successfully!")
    sys.stdout.flush()
    
    return {
        "success": True,
        "message": "Migration started in background"
    }

# ==================== LOGS ENDPOINTS ====================

@app.get("/api/logs")
async def list_logs():
    """List all migration log files"""
    try:
        logs = []
        if os.path.exists(LOGS_DIR):
            for filename in sorted(os.listdir(LOGS_DIR), reverse=True):
                if filename.endswith(".log"):
                    filepath = os.path.join(LOGS_DIR, filename)
                    stat = os.stat(filepath)
                    logs.append({
                        "filename": filename,
                        "size": stat.st_size,
                        "created": datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S"),
                        "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                    })
        return {"success": True, "logs": logs, "total": len(logs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/logs/{filename}")
async def download_log(filename: str):
    """Download a specific migration log file"""
    # Sanitize filename to prevent path traversal
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(LOGS_DIR, safe_filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Log file not found")
    
    return FileResponse(
        path=filepath,
        filename=safe_filename,
        media_type="text/plain"
    )

# ==================== SESSION & HISTORY STORAGE ENDPOINTS ====================

@app.post("/api/session/save")
async def save_session(key: str, data: SessionData):
    """Save session data to file
    
    Args:
        key: Session key (e.g., "migrationParams", "targetConfig", "migrationSettings")
        data: Session data to save
    """
    try:
        filepath = os.path.join(SESSION_DIR, f"{key}.json")
        with open(filepath, "w") as f:
            json.dump(data.data, f, indent=2)
        return {"success": True, "message": f"Session '{key}' saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/session/load")
async def load_session(key: str):
    """Load session data from file
    
    Args:
        key: Session key (e.g., "migrationParams", "targetConfig", "migrationSettings")
    """
    try:
        filepath = os.path.join(SESSION_DIR, f"{key}.json")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                data = json.load(f)
            return {"success": True, "data": data}
        return {"success": False, "data": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/session/clear")
async def clear_session(key: Optional[str] = None):
    """Clear session data
    
    Args:
        key: Optional. Specific session key to clear. If not provided, clears all sessions.
    """
    try:
        if key:
            filepath = os.path.join(SESSION_DIR, f"{key}.json")
            if os.path.exists(filepath):
                os.remove(filepath)
        else:
            # Clear all session files
            for file in os.listdir(SESSION_DIR):
                if file.endswith(".json"):
                    os.remove(os.path.join(SESSION_DIR, file))
        return {"success": True, "message": "Session cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/history/save")
async def save_history(category: str, data: HistoryData):
    """Save history data to file
    
    Args:
        category: History category (e.g., "source", "destination")
        data: History list to save
    """
    try:
        filepath = os.path.join(HISTORY_DIR, f"{category}.json")
        with open(filepath, "w") as f:
            json.dump(data.history, f, indent=2)
        return {"success": True, "message": f"History '{category}' saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history/load")
async def load_history(category: str):
    """Load history data from file
    
    Args:
        category: History category (e.g., "source", "destination")
    """
    try:
        filepath = os.path.join(HISTORY_DIR, f"{category}.json")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                history = json.load(f)
            return {"success": True, "history": history}
        return {"success": True, "history": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/history/clear")
async def clear_history(category: Optional[str] = None):
    """Clear history data
    
    Args:
        category: Optional. Specific history category to clear. If not provided, clears all history.
    """
    try:
        if category:
            filepath = os.path.join(HISTORY_DIR, f"{category}_history.json")
            if os.path.exists(filepath):
                os.remove(filepath)
        else:
            # Clear all history files
            for file in os.listdir(HISTORY_DIR):
                if file.endswith("_history.json"):
                    os.remove(os.path.join(HISTORY_DIR, file))
        return {"success": True, "message": "History cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/logout")
async def logout(target: Optional[str] = None):
    """Clear saved credentials and tokens
    
    Args:
        target: Optional. "source" or "destination" to logout specific account.
                If not provided, clears all credentials.
    """
    try:
        if target == "source":
            files = ["credentials_source.txt", "token_source.txt"]
        elif target == "destination":
            files = ["credentials_destination.txt", "token_destination.txt"]
        else:
            # Logout all
            files = ["credentials_source.txt", "token_source.txt", 
                    "credentials_destination.txt", "token_destination.txt"]
        
        for file in files:
            filepath = os.path.join(AUTH_DIR, file)
            if os.path.exists(filepath):
                os.remove(filepath)
        
        return {"success": True, "message": f"Logged out {target or 'all'} successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SERVE FRONTEND ====================
# Serve frontend secara statis melalui FastAPI
# Ini menghilangkan masalah CORS/Same-Origin saat dijalankan di Electron
from fastapi.staticfiles import StaticFiles

# Prioritas: env var FRONTEND_DIR > relative path (development)
frontend_dir = os.getenv("FRONTEND_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend'))

if not os.path.exists(frontend_dir):
    # Fallback to sys.executable directory (for PyInstaller bundled .exe)
    import sys
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable) # Ini adalah folder 'bin'
        fallback_dir = os.path.join(exe_dir, '..', 'frontend')
        if os.path.exists(fallback_dir):
            frontend_dir = fallback_dir

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    logger.info(f"Serving frontend from: {frontend_dir}")
else:
    logger.error(f"Frontend directory not found: {frontend_dir}")
    # Mount a dummy route so it doesn't just show a blank 404
    @app.get("/")
    def fallback_route():
        return {"error": "Frontend UI files not found. Please check your build configuration."}

if __name__ == "__main__":
    import uvicorn
    # Use the app object directly for PyInstaller compatibility
    uvicorn.run(app, host="0.0.0.0", port=8000)
