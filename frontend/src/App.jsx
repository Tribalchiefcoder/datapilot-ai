import { useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:5000";

function App() {
  const [backendStatus, setBackendStatus] = useState("Not connected");
  const [isChecking, setIsChecking] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [dataset, setDataset] = useState(null);

  // Check whether the Flask backend is running.
  async function checkBackend() {
    setIsChecking(true);
    setBackendStatus("Connecting...");

    try {
      const response = await fetch(`${API_URL}/api/health`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Backend connection failed.");
      }

      setBackendStatus(data.message || "Backend connected successfully!");
      console.log("Backend health response:", data);
    } catch (error) {
      console.error("Backend connection error:", error);
      setBackendStatus(`Connection failed: ${error.message}`);
    } finally {
      setIsChecking(false);
    }
  }

  // Upload a CSV or Excel dataset to Flask.
  async function handleUpload() {
    if (!selectedFile) {
      setUploadMessage("Please select a CSV or XLSX file first.");
      return;
    }

    const extension = selectedFile.name.split(".").pop().toLowerCase();

    if (!["csv", "xlsx"].includes(extension)) {
      setUploadMessage("Invalid file type. Please select a CSV or XLSX file.");
      return;
    }

    setIsUploading(true);
    setUploadMessage("Uploading and analysing your dataset...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      // Debugging: verify the selected file before sending it.
      console.log("Selected file:", selectedFile);
      console.log("File name:", selectedFile.name);
      console.log("FormData file:", formData.get("file"));

      const response = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      // Read the response safely, even if Flask returns unexpected text.
      const responseText = await response.text();

      let result;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          `The backend returned an unexpected response (HTTP ${response.status}).`
        );
      }

      console.log("Upload HTTP status:", response.status);
      console.log("Upload response:", result);

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.error ||
            `Upload failed with HTTP ${response.status}.`
        );
      }

      if (result.success === false) {
        throw new Error(result.message || result.error || "Upload failed.");
      }

      if (!Array.isArray(result.column_names) ||
          !Array.isArray(result.preview)) {
        throw new Error(
          "The file was received, but the backend response is missing the dataset preview."
        );
      }

      setDataset(result);

      setUploadMessage(
        `Success! ${result.filename} uploaded. ` +
        `${result.rows} rows and ${result.columns} columns found.`
      );
    } catch (error) {
      console.error("Dataset upload error:", error);
      setUploadMessage(error.message || "Unable to upload the dataset.");
    } finally {
      setIsUploading(false);
    }
  }

  // Update the selected file.
  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;

    setSelectedFile(file);
    setUploadMessage("");

    console.log("File selected:", file);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>DataPilot AI</h1>
          <p>Intelligent Business Data Analysis</p>
        </div>

        <span className="badge">Day 3 · Data Analysis</span>
      </header>

      <main className="workspace">
        <section className="spreadsheet-panel">
          <div className="panel-heading">
            <h2>Data Workspace</h2>
            <p>Upload a dataset to explore and analyse your data.</p>
          </div>

          <div className="upload-section">
            <label htmlFor="dataset-file">Choose a dataset</label>

            <input
              type="file"
              id="dataset-file"
              accept=".csv,.xlsx"
              onChange={handleFileChange}
              disabled={isUploading}
            />

            {selectedFile && (
              <p className="selected-file">
                Selected: {selectedFile.name}
              </p>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !selectedFile}
            >
              {isUploading ? "Processing..." : "Upload Dataset"}
            </button>

            {uploadMessage && (
              <p className="upload-message" role="status">
                {uploadMessage}
              </p>
            )}
          </div>

          {!dataset && (
            <div className="empty-state">
              <div className="empty-icon">▦</div>
              <h3>Your data starts here</h3>
              <p>
                Upload a CSV or Excel file to view your data and
                begin analysing business performance.
              </p>
            </div>
          )}

          {dataset && (
            <section className="dataset-preview">
              <h2>Dataset Preview</h2>

              <div className="dataset-summary">
                <div className="summary-card">
                  <span>Filename</span>
                  <strong>{dataset.filename}</strong>
                </div>

                <div className="summary-card">
                  <span>Total Rows</span>
                  <strong>{dataset.rows}</strong>
                </div>

                <div className="summary-card">
                  <span>Total Columns</span>
                  <strong>{dataset.columns}</strong>
                </div>
              </div>

              {dataset.analysis && (
                <section className="analysis-summary">
                  <h3>Automatic Analysis</h3>

                  <div className="dataset-summary">
                    <div className="summary-card">
                      <span>Numeric Columns</span>
                      <strong>{dataset.analysis.numeric_columns}</strong>
                    </div>

                    <div className="summary-card">
                      <span>Text Columns</span>
                      <strong>{dataset.analysis.text_columns}</strong>
                    </div>

                    <div className="summary-card">
                      <span>Missing Values</span>
                      <strong>{dataset.analysis.total_missing_values}</strong>
                    </div>
                  </div>

                  {dataset.analysis.numeric_summary &&
                    Object.keys(dataset.analysis.numeric_summary).length > 0 && (
                      <>
                        <h3>Numeric Statistics</h3>

                        <div className="table-container">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Column</th>
                                <th>Mean</th>
                                <th>Minimum</th>
                                <th>Maximum</th>
                                <th>Standard Deviation</th>
                              </tr>
                            </thead>

                            <tbody>
                              {Object.entries(
                                dataset.analysis.numeric_summary
                              ).map(([column, stats]) => (
                                <tr key={column}>
                                  <td>{column}</td>
                                  <td>{stats.mean ?? "—"}</td>
                                  <td>{stats.minimum ?? "—"}</td>
                                  <td>{stats.maximum ?? "—"}</td>
                                  <td>{stats.standard_deviation ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                  {dataset.analysis.missing_by_column && (
                    <>
                      <h3>Missing Values by Column</h3>

                      <div className="table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Column</th>
                              <th>Missing Values</th>
                            </tr>
                          </thead>

                          <tbody>
                            {Object.entries(
                              dataset.analysis.missing_by_column
                            ).map(([column, count]) => (
                              <tr key={column}>
                                <td>{column}</td>
                                <td>{count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}

              <h3>First {dataset.preview.length} Rows</h3>

              <div className="table-container">
                {dataset.column_names.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        {dataset.column_names.map((column, index) => (
                          <th key={index}>{column}</th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {dataset.preview.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {dataset.column_names.map((column, colIndex) => (
                            <td key={colIndex}>
                              {row[column] == null
                                ? "—"
                                : String(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>This dataset has no columns to display.</p>
                )}

                {dataset.rows > dataset.preview.length && (
                  <p className="preview-note">
                    Showing the first {dataset.preview.length} rows
                    out of {dataset.rows} total rows.
                  </p>
                )}

                {dataset.rows === 0 && (
                  <p>This dataset contains no data rows.</p>
                )}
              </div>
            </section>
          )}
        </section>

        <aside className="chat-panel">
          <h2>AI Business Analyst</h2>

          <div className="chat-placeholder">
            <p>
              Upload a dataset to prepare for asking questions about
              revenue, profit, sales, and business performance.
            </p>
          </div>

          <input
            type="text"
            placeholder="Ask a question..."
            disabled
          />

          <button className="secondary-button" disabled>
            Send
          </button>
        </aside>
      </main>

      <footer className="footer">
        <p>
          Backend status: <strong>{backendStatus}</strong>
        </p>

        <button
          type="button"
          onClick={checkBackend}
          disabled={isChecking}
        >
          {isChecking ? "Checking..." : "Test Backend Connection"}
        </button>
      </footer>
    </div>
  );
}

export default App;