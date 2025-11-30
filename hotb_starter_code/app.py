# app.py

import threading
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# Import the core function
import eeg_processor

# --- Shared State and Thread Control ---
# This dictionary holds the latest state updated by the EEG thread
LATEST_STATE: Dict[str, Any] = {
    "timestamp": 0.0,
    "stress": 0.5,
    "concentration": 0.5,
    "fatigue": 0.5,
    "stress_level": "M",
    "concentration_level": "M",
    "fatigue_level": "M",
    "action": "waiting_for_data",
    "flow": 0.0,
    "overload": 0.0,
}

# Event to signal the EEG thread to stop gracefully
stop_event = threading.Event()
# Thread to run the EEG acquisition logic
eeg_thread = threading.Thread(
    target=eeg_processor.eeg_acquisition_loop,
    args=(LATEST_STATE, stop_event),
    daemon=True
)

# --- FastAPI Setup ---
app = FastAPI(
    title="EEG Adaptive State API",
    description="Provides real-time cognitive state and adaptation decisions.",
    version="1.0.0",
)

origins = [
    "http://localhost:7000",
    "http://127.0.0.1:7000",
    # "http://localhost:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # or ["*"] for the developer mode
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- API Models (Pydantic for validation and documentation) ---
class AdaptiveState(BaseModel):
    timestamp: float
    stress: float
    concentration: float
    fatigue: float
    stress_level: str
    concentration_level: str
    fatigue_level: str
    action: str
    flow: float
    overload: float


# --- API Endpoints ---

@app.get(
    "/api/v1/state",
    response_model=AdaptiveState,
    summary="Get Current Adaptive State"
)
async def get_current_state():
    """
    Returns the latest processed EEG state (stress, concentration, fatigue)
    and the recommended adaptation decision.
    """
    # Check if the EEG thread has started and provided initial data
    if LATEST_STATE.get("timestamp", 0.0) < 1.0:
        raise HTTPException(
            status_code=503,
            detail="EEG data acquisition not ready or device not connected."
        )

    return LATEST_STATE


# --- Startup and Shutdown Events ---

@app.on_event("startup")
def startup_event():
    """Start the EEG acquisition thread when the FastAPI server starts."""
    print("[API] Starting EEG acquisition thread...")
    eeg_thread.start()


@app.on_event("shutdown")
def shutdown_event():
    """Signal the EEG thread to stop gracefully when the FastAPI server shuts down."""
    print("[API] Shutting down. Signaling EEG thread to stop...")
    stop_event.set()
    # Wait for the thread to finish (optional, but good practice)
    eeg_thread.join(timeout=5.0)
    if eeg_thread.is_alive():
        print("[WARN] EEG thread did not shut down gracefully.")
    print("[API] Server shutdown complete.")


# --- Run Instructions ---
if __name__ == "__main__":
    import uvicorn

    # Make sure to replace 'BA HALO 081' with your actual device name
    print(f"Starting FastAPI server...")
    print(f"Ensure your device ({eeg_processor.DEVICE_NAME}) is on and paired.")
    uvicorn.run(app, host="0.0.0.0", port=8000)