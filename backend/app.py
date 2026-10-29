import pandas as pd
from flask import request, jsonify
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

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

@app.post("/api/upload")
def upload_dataset():

    # 1. Check whether a file was uploaded
    if "file" not in request.files:
        return jsonify({
            "error": "No file was uploaded."
        }), 400

    file = request.files["file"]

    # 2. Check whether the user selected a file
    if not file.filename:
        return jsonify({
            "error": "Please select a file."
        }), 400

    # 3. Check the file extension
    filename = file.filename
    extension = filename.rsplit(".", 1)[-1].lower()

    if extension not in {"csv", "xlsx"}:
        return jsonify({
            "error": "Only CSV and XLSX files are supported."
        }), 400

    try:
        # 4. Read the dataset
        if extension == "csv":
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file, engine="openpyxl")

        # 5. Prepare a preview of the first 100 rows
        preview = df.head(100)

        # 6. Replace missing values with JSON-compatible nulls
        preview = preview.astype(object).where(
            pd.notna(preview), None
        )

        # 7. Return the dataset information
        return jsonify({
            "success": True,
            "filename": filename,
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "column_names": [
                str(column) for column in df.columns
            ],
            "preview": preview.to_dict(orient="records")
        })

    except Exception:
        return jsonify({
            "error": (
                "Unable to read this file. "
                "Check that it is a valid CSV or XLSX file."
            )
        }), 400

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )