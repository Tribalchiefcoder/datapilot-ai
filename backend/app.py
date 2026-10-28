from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)

# Allow the local React frontend to communicate with Flask.
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5175",
                "http://127.0.0.1:5175"
            ]
        }
    }
)


@app.get("/api/health")
def health_check():
    return jsonify({
        "status": "success",
        "message": "Backend connected successfully!",
        "application": "DataPilot AI"
    })


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )