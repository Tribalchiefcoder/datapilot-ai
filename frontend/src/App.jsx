
import { useState } from "react";
import "./App.css";

function App() {
  const [backendStatus, setBackendStatus] = useState("Not connected");
  const [isChecking, setIsChecking] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [dataset, setDataset] = useState(null);

  const handleUpload = async () => {
  if (!selectedFile) {
    setUploadMessage("Please select a file first.");
    return;
  }

  const extension = selectedFile.name
    .split(".")
    .pop()
    .toLowerCase();

  if (!["csv", "xlsx"].includes(extension)) {
    setUploadMessage("Please select a CSV or XLSX file.");
    return;
  }

  setIsUploading(true);
  setUploadMessage("Uploading and processing your dataset...");

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch(
      "http://127.0.0.1:5000/api/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Upload failed.");
    }

    setDataset(result);
    setUploadMessage(
      `Success! ${result.filename} processed. ` +
      `Rows: ${result.rows}, Columns: ${result.columns}.`
    );

  } catch (error) {
    setUploadMessage(
      error.message || "Unable to connect to the backend."
    );
  } finally {
    setIsUploading(false);
  }
};
  async function checkBackend() {
    setIsChecking(true);
    setBackendStatus("Connecting...");

    try {
      const response = await fetch(
        "http://127.0.0.1:5000/api/health"
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      setBackendStatus(
        data.message || "Backend connected successfully!"
      );

      console.log("Backend response:", data);
    } catch (error) {
      console.error("Backend connection error:", error);

      setBackendStatus(`Connection failed: ${error.message}`);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>DataPilot AI</h1>
          <p>Intelligent Business Data Analysis</p>
        </div>

        <span className="badge">Day 1 · Development</span>
      </header>

      <main className="workspace">
        <section className="spreadsheet-panel">
          <div className="panel-heading">
            <div>
              <h2>Data Workspace</h2>
              <p>Your uploaded data will appear here.</p>
            <div className="upload-section">
              </div>
  <input
    type="file"
    id="dataset-file"
    accept=".csv,.xlsx"
    onChange={(event) => {
      setSelectedFile(event.target.files[0] || null);
      setUploadMessage("");
    }}
  />

  <button
    type="button"
    onClick={handleUpload}
    disabled={isUploading}
  >
    {isUploading ? "Uploading..." : "Upload Dataset"}
  </button>

  {uploadMessage && (
    <p className="upload-message" role="status">
      {uploadMessage}
    </p>
  )}
</div>
</div>
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

    <div className="table-container">
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
                  {row[column] == null ? "—" : String(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {dataset.rows > dataset.preview.length && (
        <p className="preview-note">
          Showing the first {dataset.preview.length} rows
          out of {dataset.rows} total rows.
        </p>
      )}

      {dataset.rows === 0 && (
        <p>This dataset contains no rows.</p>
      )}
    </div>
  </section>
)}

          <div className="empty-state">
            <div className="empty-icon">▦</div>

            <h3>Your data starts here</h3>

            <p>
              Upload a CSV, Excel, or JSON file to begin
              analysing your business data.
            </p>
          </div>
        </section>

        <aside className="chat-panel">
          <h2>AI Business Analyst</h2>

          <div className="chat-placeholder">
            <p>
              Upload a dataset to start asking questions about
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
