
import { useState } from "react";
import "./App.css";

function App() {
  const [backendStatus, setBackendStatus] = useState("Not connected");
  const [isChecking, setIsChecking] = useState(false);

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
            </div>

            <button className="primary-button" disabled>
              Upload Dataset
            </button>
          </div>

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
