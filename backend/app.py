import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge

app = Flask(__name__)

# Limit uploaded files to 10 MB.
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
                "http://127.0.0.1:5175",
            ]
        }
    },
)


@app.get("/api/health")
def health_check():
    return jsonify({
        "status": "success",
        "message": "Backend connected successfully!",
        "application": "DataPilot AI",
    })


@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(error):
    return jsonify({
        "success": False,
        "error": "File is too large. The maximum upload size is 10 MB.",
    }), 413


@app.post("/api/upload")
def upload_dataset():
    print("DEBUG: Upload endpoint reached")
    print("DEBUG: Request files:", request.files)
    print("DEBUG: Request form:", request.form)

    # 1. Check whether a file was included in the request.
    if "file" not in request.files:
        return jsonify({
            "success": False,
            "error": "No file was uploaded. Please choose a file first.",
        }), 400

    file = request.files["file"]

    # 2. Check whether the user selected a file.
    if not file.filename:
        return jsonify({
            "success": False,
            "error": "Please select a file.",
        }), 400

    # 3. Check the file extension.
    filename = file.filename
    if "." not in filename:
        return jsonify({
            "success": False,
            "error": "The file must have a .csv or .xlsx extension.",
        }), 400

    extension = filename.rsplit(".", 1)[-1].lower()
    if extension not in {"csv", "xlsx"}:
        return jsonify({
            "success": False,
            "error": "Only CSV and XLSX files are supported.",
        }), 400

    try:
        # 4. Read the dataset.
        if extension == "csv":
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file, engine="openpyxl")

        # Avoid returning a misleading success for files without columns.
        if len(df.columns) == 0:
            return jsonify({
                "success": False,
                "error": "The uploaded file does not contain any columns.",
            }), 400

        # 5. Prepare the first 100 rows for the frontend.
        preview = df.head(100).astype(object)
        preview = preview.where(pd.notna(preview), None)

        # 6. Identify numeric columns.
        numeric_df = df.select_dtypes(include="number")

        # 7. Calculate summary statistics for numeric columns.
        numeric_summary = {}
        for column in numeric_df.columns:
            series = numeric_df[column]
            mean_value = series.mean()
            min_value = series.min()
            max_value = series.max()
            std_value = series.std()

            numeric_summary[str(column)] = {
                "mean": float(mean_value) if pd.notna(mean_value) else None,
                "minimum": float(min_value) if pd.notna(min_value) else None,
                "maximum": float(max_value) if pd.notna(max_value) else None,
                "standard_deviation": (
                    float(std_value) if pd.notna(std_value) else None
                ),
            }

        # 8. Count missing values per column and overall.
        missing_by_column = {
            str(column): int(count)
            for column, count in df.isnull().sum().items()
        }
        total_missing_values = int(df.isnull().sum().sum())

        # 9. Count numeric and text-like columns.
        numeric_column_count = int(len(numeric_df.columns))
        text_column_count = int(
            len(df.select_dtypes(
                include=["object", "string", "category", "bool"]
            ).columns)
        )

        # 10. Return all dataset information and analysis.
        return jsonify({
            "success": True,
            "filename": filename,
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "column_names": [str(column) for column in df.columns],
            "preview": preview.to_dict(orient="records"),
            "analysis": {
                "numeric_columns": numeric_column_count,
                "text_columns": text_column_count,
                "total_missing_values": total_missing_values,
                "missing_by_column": missing_by_column,
                "numeric_summary": numeric_summary,
            },
        })

    except (pd.errors.EmptyDataError, pd.errors.ParserError) as error:
        print("UPLOAD PARSING ERROR:", repr(error))
        return jsonify({
            "success": False,
            "error": (
                "Could not parse this file. Check that the CSV is valid "
                "and uses a consistent number of fields per row."
            ),
        }), 400

    except Exception as error:
        # Keep the detailed error in the terminal for debugging.
        print("UPLOAD ERROR:", repr(error))
        return jsonify({
            "success": False,
            "error": (
                "Unable to process this file. Check that it is a valid "
                "CSV or XLSX file and try again."
            ),
        }), 400


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )
