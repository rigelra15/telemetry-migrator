"""
Entity Info API
Provides endpoint to fetch entity information (Asset or Device) from ThingsBoard
"""
from fastapi import HTTPException
import httpx
import os
from typing import Optional

async def get_entity_info(entity_type: str, entity_id: str, token: str, base_url: str) -> dict:
    """
    Fetch entity information from ThingsBoard API
    
    Args:
        entity_type: Type of entity (ASSET or DEVICE)
        entity_id: UUID of the entity
        token: JWT token for authentication
        base_url: ThingsBoard base URL
    
    Returns:
        dict with entity information including name
    """
    try:
        entity_type_upper = entity_type.upper()
        
        # Determine the correct API endpoint based on entity type
        if entity_type_upper == "ASSET":
            url = f"{base_url}/api/asset/info/{entity_id}"
        elif entity_type_upper == "DEVICE":
            url = f"{base_url}/api/device/{entity_id}"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported entity type: {entity_type}")
        
        headers = {
            "X-Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        print(f"Fetching entity info from: {url}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "entityType": entity_type_upper,
                    "entityId": entity_id,
                    "name": data.get("name", "N/A"),
                    "label": data.get("label", ""),
                    "type": data.get("type", ""),
                    "createdTime": data.get("createdTime", 0)
                }
            elif response.status_code == 401:
                print(f"401 Unauthorized: {response.text}")
                raise HTTPException(status_code=401, detail="Unauthorized - Invalid token")
            elif response.status_code == 404:
                print(f"404 Not Found: {response.text}")
                raise HTTPException(status_code=404, detail=f"Entity not found: {entity_id}")
            else:
                print(f"Error {response.status_code}: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch entity info: {response.text}"
                )
                
    except HTTPException:
        # Re-raise HTTPException without wrapping
        raise
    except httpx.RequestError as e:
        print(f"httpx.RequestError: {e}")
        raise HTTPException(status_code=500, detail=f"Request failed: {str(e)}")
    except Exception as e:
        print(f"Unexpected error in get_entity_info: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
