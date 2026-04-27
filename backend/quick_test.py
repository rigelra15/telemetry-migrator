"""Quick test to prove API behavior with interval parameter"""
import httpx
import asyncio
from datetime import datetime

BASE_URL = "https://flexiot.xlsmart.co.id"
ENTITY_TYPE = "ASSET"
ENTITY_ID = "5bf9fc50-70fa-11f0-8e7f-3d041346deb6"

# Read token and keys
with open("auth/token_get.txt") as f:
    TOKEN = f.read().strip()
with open("config/PWSS-IDM-03_keys.txt") as f:
    raw_keys = f.read().strip()
    # Convert newline-separated to comma-separated (ThingsBoard API format)
    keys_list = [k.strip() for k in raw_keys.splitlines() if k.strip()]
    KEYS = ",".join(keys_list)
    print(f"✅ Loaded {len(keys_list)} keys from file")
    print(f"Keys format: {KEYS[:100]}...")  # Show first 100 chars

# Nov 1, 2025
START_TS = int(datetime(2025, 11, 1, 0, 0, 0).timestamp() * 1000)
END_TS = int(datetime(2025, 11, 1, 23, 59, 59).timestamp() * 1000)

async def test_with_interval_0():
    """Test with interval=0 (should get raw data ~107k records)"""
    print("\n" + "="*80)
    print("🧪 TEST: WITH interval=0 (Expected: ~107,328 RAW records)")
    print("="*80)
    
    params = {
        "keys": KEYS,
        "startTs": START_TS,
        "endTs": END_TS,
        "interval": 0,
        "limit": 50000,
        "orderBy": "ASC",
        "useStrictDataTypes": False
    }
    
    url = f"{BASE_URL}/api/plugins/telemetry/{ENTITY_TYPE}/{ENTITY_ID}/values/timeseries"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(
            url,
            headers={"X-Authorization": f"Bearer {TOKEN}"},
            params=params
        )
        
        print(f"📡 Request URL: {response.request.url}\n")
        
        if response.status_code == 200:
            data = response.json()
            total = sum(len(v) for v in data.values())
            print(f"✅ Status: {response.status_code}")
            print(f"📊 Total records: {total}")
            return total
        else:
            print(f"❌ Status: {response.status_code}")
            print(f"Response: {response.text}")
            return 0

async def test_without_interval():
    """Test without interval (should get aggregated ~1440 records)"""
    print("\n" + "="*80)
    print("🧪 TEST: WITHOUT interval (Expected: 1,440 AGGREGATED records)")
    print("="*80)
    
    params = {
        "keys": KEYS,
        "startTs": START_TS,
        "endTs": END_TS,
        "limit": 50000,
        "orderBy": "ASC",
        "useStrictDataTypes": False
    }
    
    url = f"{BASE_URL}/api/plugins/telemetry/{ENTITY_TYPE}/{ENTITY_ID}/values/timeseries"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(
            url,
            headers={"X-Authorization": f"Bearer {TOKEN}"},
            params=params
        )
        
        print(f"📡 Request URL: {response.request.url}\n")
        
        if response.status_code == 200:
            data = response.json()
            total = sum(len(v) for v in data.values())
            print(f"✅ Status: {response.status_code}")
            print(f"📊 Total records: {total}")
            return total
        else:
            print(f"❌ Status: {response.status_code}")
            print(f"Response: {response.text}")
            return 0

async def main():
    print("\n" + "🎯"*40)
    print("QUICK API TEST - Proving interval=0 behavior")
    print("🎯"*40)
    
    result1 = await test_with_interval_0()
    result2 = await test_without_interval()
    
    print("\n" + "="*80)
    print("📊 SUMMARY")
    print("="*80)
    print(f"WITH interval=0:     {result1:,} records {'✅ CORRECT!' if result1 > 100000 else '❌ WRONG!'}")
    print(f"WITHOUT interval:    {result2:,} records {'✅ (aggregated)' if result2 < 2000 else '❌ WRONG!'}")
    print("="*80)
    
    if result1 > 100000:
        print("\n✅ API works correctly with interval=0!")
        print("❌ Problem is in api.py - parameter not being sent correctly")
    else:
        print("\n❌ API doesn't work even with direct httpx call!")
        print("⚠️  Check token, entity ID, or ThingsBoard server")

if __name__ == "__main__":
    asyncio.run(main())
