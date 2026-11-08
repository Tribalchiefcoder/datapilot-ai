import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000"
).replace(/\/+$/, "");
const PAGE_SIZE = 100;
const CHART_FETCH_SIZE = 500;

async function readJson(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected backend response (HTTP ${response.status}).`);
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem("datapilot-theme") || "light";
    } catch {
      return "light";
    }
  });

  function toggleTheme() {
    setTheme((previous) => {
      const nextTheme = previous === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem("datapilot-theme", nextTheme);
      } catch {
        // Theme still changes for this session if storage is unavailable.
      }
      return nextTheme;
    });
  }
  const [backendStatus, setBackendStatus] = useState("Not connected");
  const [isChecking, setIsChecking] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [dataset, setDataset] = useState(null);
  const [activeTab, setActiveTab] = useState("data");
  const [selectedCell, setSelectedCell] = useState({ rowIndex: 0, colIndex: 0 });
  const [selectedRowForCopy, setSelectedRowForCopy] = useState(null);
  const [selectedRange, setSelectedRange] = useState({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  const isSelectingRange = useRef(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [sortColumn, setSortColumn] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [columnWidths, setColumnWidths] = useState({});
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingCellSaves = useRef(new Set());

  // Day 8: chart configuration and complete-dataset chart rows.
  const [chartType, setChartType] = useState("bar");
  const [chartLabelColumn, setChartLabelColumn] = useState("");
  const [chartValueColumn, setChartValueColumn] = useState("");
  const [chartRows, setChartRows] = useState([]);
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [chartMessage, setChartMessage] = useState("");

  // Day 9: automatic insights and dataset Q&A.
  const [aiInsights, setAiInsights] = useState([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState([]);
  const [modelTier, setModelTier] = useState("basic");
  const [lastUsedModel, setLastUsedModel] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);

  function getColumnLetter(index) {
    let number = index + 1;
    let label = "";
    while (number > 0) {
      const remainder = (number - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      number = Math.floor((number - 1) / 26);
    }
    return label;
  }

  const selectedColumn = dataset?.column_names?.[selectedCell.colIndex] || "";
  const selectedRow = dataset?.preview?.[selectedCell.rowIndex];
  const selectedCellValue =
    selectedRow && selectedColumn
      ? (selectedRow[selectedColumn] == null ? "" : String(selectedRow[selectedColumn]))
      : "";

  function updateSelectedCellValue(value) {
    if (!dataset || !selectedColumn) return;
    setDataset((previous) => ({
      ...previous,
      preview: previous.preview.map((row, index) =>
        index === selectedCell.rowIndex ? { ...row, [selectedColumn]: value } : row
      ),
    }));
  }

  function focusSpreadsheetCell(rowIndex, colIndex) {
    if (!dataset) return;
    const nextRow = Math.max(0, Math.min(dataset.preview.length - 1, rowIndex));
    const nextCol = Math.max(0, Math.min(dataset.column_names.length - 1, colIndex));
    setSelectedCell({ rowIndex: nextRow, colIndex: nextCol });
    const nextInput = document.querySelector(
      `.spreadsheet-cell[data-row-index="${nextRow}"][data-col-index="${nextCol}"]`
    );
    nextInput?.focus();
    nextInput?.select();
  }

  function handleSpreadsheetKeyDown(event, rowIndex, colIndex) {
    const moves = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0],
      ArrowLeft: [0, -1], ArrowRight: [0, 1],
      Enter: [event.shiftKey ? -1 : 1, 0],
      Tab: [0, event.shiftKey ? -1 : 1],
    };
    const move = moves[event.key];
    if (!move || !dataset) return;

    // Keep normal text-cursor movement for left/right arrows inside a cell.
    if (
      (event.key === "ArrowLeft" && event.currentTarget.selectionStart > 0) ||
      (event.key === "ArrowRight" && event.currentTarget.selectionEnd < event.currentTarget.value.length)
    ) return;

    let nextRow = rowIndex + move[0];
    let nextCol = colIndex + move[1];
    if (nextCol < 0) { nextCol = dataset.column_names.length - 1; nextRow -= 1; }
    if (nextCol >= dataset.column_names.length) { nextCol = 0; nextRow += 1; }
    if (nextRow < 0 || nextRow >= dataset.preview.length) return;
    event.preventDefault();
    focusSpreadsheetCell(nextRow, nextCol);
  }

  function normalizeRange(range) {
    return {
      top: Math.min(range.startRow, range.endRow),
      bottom: Math.max(range.startRow, range.endRow),
      left: Math.min(range.startCol, range.endCol),
      right: Math.max(range.startCol, range.endCol),
    };
  }

  async function copySelectedRange(event, range = selectedRange) {
    if (!dataset) return;
    event?.preventDefault();
    const bounds = normalizeRange(range);
    const lines = [];
    for (let rowIndex = bounds.top; rowIndex <= bounds.bottom; rowIndex += 1) {
      const row = dataset.preview[rowIndex];
      if (!row) continue;
      const values = [];
      for (let colIndex = bounds.left; colIndex <= bounds.right; colIndex += 1) {
        const column = dataset.column_names[colIndex];
        const value = column && row[column] != null ? String(row[column]) : "";
        values.push(value.replace(/\t/g, " ").replace(/\r?\n/g, " "));
      }
      lines.push(values.join("\t"));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setUploadMessage(`Copied ${bounds.bottom - bounds.top + 1} row(s) × ${bounds.right - bounds.left + 1} column(s). Select a starting cell and press Ctrl+V.`);
    } catch {
      setUploadMessage("Could not access the clipboard. Try using localhost and allow clipboard access.");
    }
  }

  async function copySpreadsheetRow(event, rowIndex) {
    if (!dataset) return;
    const range = { startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: dataset.column_names.length - 1 };
    setSelectedRange(range);
    setSelectedCell({ rowIndex, colIndex: 0 });
    setSelectedRowForCopy(rowIndex);
    await copySelectedRange(event, range);
  }

  async function copySpreadsheetColumn(event, colIndex) {
    if (!dataset) return;
    const range = { startRow: 0, endRow: dataset.preview.length - 1, startCol: colIndex, endCol: colIndex };
    setSelectedRange(range);
    setSelectedCell({ rowIndex: 0, colIndex });
    await copySelectedRange(event, range);
  }

  async function handleSpreadsheetPaste(event, startRow, startCol) {
    const pastedText = event.clipboardData?.getData("text");
    if (!pastedText || !dataset || (!pastedText.includes("\t") && !pastedText.includes("\n"))) return;
    event.preventDefault();
    const matrix = pastedText.replace(/\r/g, "").split("\n").filter((line, index, all) => line !== "" || index < all.length - 1).map((line) => line.split("\t"));
    const changes = [];
    matrix.forEach((values, rowDelta) => values.forEach((value, colDelta) => {
      const rowIndex = startRow + rowDelta;
      const colIndex = startCol + colDelta;
      const column = dataset.column_names[colIndex];
      if (rowIndex < dataset.preview.length && column) changes.push({ rowIndex, column, value });
    }));
    if (!changes.length) return;
    setDataset((previous) => {
      const preview = previous.preview.map((row) => ({ ...row }));
      changes.forEach(({ rowIndex, column, value }) => { preview[rowIndex][column] = value; });
      return { ...previous, preview };
    });
    const lastRow = Math.min(dataset.preview.length - 1, startRow + matrix.length - 1);
    const lastCol = Math.min(dataset.column_names.length - 1, startCol + Math.max(...matrix.map((row) => row.length)) - 1);
    setSelectedRange({ startRow, startCol, endRow: lastRow, endCol: lastCol });
    for (const change of changes) await saveCellAndTrack(change.rowIndex, change.column, change.value);
    setUploadMessage(`Pasted ${changes.length} cell(s).`);
  }

  function startColumnResize(event, column) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column] || 145;
    const onMove = (moveEvent) => {
      const nextWidth = Math.max(80, Math.min(600, startWidth + moveEvent.clientX - startX));
      setColumnWidths((previous) => ({ ...previous, [column]: nextWidth }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function checkBackend() {
    setIsChecking(true);
    setBackendStatus("Connecting...");
    try {
      const data = await readJson(await fetch(`${API_URL}/api/health`));
      setBackendStatus(data.message || "Backend connected successfully!");
    } catch (error) {
      setBackendStatus(`Connection failed: ${error.message}`);
    } finally {
      setIsChecking(false);
    }
  }

  async function loadPage(datasetId, offset = pageOffset, metadata = {}, viewOptions = {}) {
    const nextSortColumn = Object.prototype.hasOwnProperty.call(viewOptions, "sortColumn") ? viewOptions.sortColumn : sortColumn;
    const nextSortOrder = Object.prototype.hasOwnProperty.call(viewOptions, "sortOrder") ? viewOptions.sortOrder : sortOrder;
    const nextFilterColumn = Object.prototype.hasOwnProperty.call(viewOptions, "filterColumn") ? viewOptions.filterColumn : filterColumn;
    const nextFilterValue = Object.prototype.hasOwnProperty.call(viewOptions, "filterValue") ? viewOptions.filterValue : filterValue;
    setIsLoadingPage(true);
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
      if (nextSortColumn) { params.set("sort_by", nextSortColumn); params.set("sort_order", nextSortOrder); }
      if (nextFilterColumn && nextFilterValue.trim()) {
        params.set("filter_column", nextFilterColumn);
        params.set("filter_value", nextFilterValue.trim());
      }
      const data = await readJson(await fetch(
        `${API_URL}/api/dataset/${datasetId}/rows?${params.toString()}`
      ));
      setDataset((previous) => ({
        ...(previous || {}), ...metadata,
        dataset_id: datasetId, rows: data.rows, total_rows: data.total_rows ?? data.rows,
        row_indices: data.row_indices || [], columns: data.column_names.length,
        column_names: data.column_names, preview: data.data,
      }));
      setPageOffset(offset);
      if (metadata.analysis) loadAIInsights(datasetId);
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setIsLoadingPage(false);
    }
  }

  function applySpreadsheetView(next = {}) {
    if (!dataset) return;
    const options = {
      sortColumn: Object.prototype.hasOwnProperty.call(next, "sortColumn") ? next.sortColumn : sortColumn,
      sortOrder: Object.prototype.hasOwnProperty.call(next, "sortOrder") ? next.sortOrder : sortOrder,
      filterColumn: Object.prototype.hasOwnProperty.call(next, "filterColumn") ? next.filterColumn : filterColumn,
      filterValue: Object.prototype.hasOwnProperty.call(next, "filterValue") ? next.filterValue : filterValue,
    };
    setSortColumn(options.sortColumn); setSortOrder(options.sortOrder);
    setFilterColumn(options.filterColumn); setFilterValue(options.filterValue);
    setSelectedCell({ rowIndex: 0, colIndex: 0 });
    loadPage(dataset.dataset_id, 0, {}, options);
  }

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
    setUploadMessage("Uploading and analysing your complete dataset...");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const result = await readJson(await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      }));
      if (!result.dataset_id || !Array.isArray(result.column_names)) {
        throw new Error("The backend response is missing the dataset ID or column names.");
      }
      setDataset({ ...result, preview: result.preview || [], row_indices: (result.preview || []).map((_, index) => index), total_rows: result.rows });
      setSortColumn(""); setSortOrder("asc"); setFilterColumn(""); setFilterValue("");
      setSelectedCell({ rowIndex: 0, colIndex: 0 });
      setActiveTab("data");
      const numericColumns = Object.keys(result.analysis?.numeric_summary || {});
      const firstLabelColumn =
        result.column_names.find((column) => !numericColumns.includes(column)) || "";
      setChartValueColumn(numericColumns[0] || "");
      setChartLabelColumn(firstLabelColumn);
      setChartRows([]);
      setChartMessage("");
      setAiMessages([]);
      setAiInsights([]);
      loadAIInsights(result.dataset_id);
      setPageOffset(0);
      setUploadMessage(
        `Success! ${result.filename} uploaded: ${result.rows} rows and ${result.columns} columns.`
      );
    } catch (error) {
      setUploadMessage(error.message || "Unable to upload the dataset.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCellSave(rowIndex, column, value) {
    if (!dataset) return false;
    try {
      const result = await readJson(await fetch(
        `${API_URL}/api/dataset/${dataset.dataset_id}/cell`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ row_index: dataset.row_indices?.[rowIndex] ?? (pageOffset + rowIndex), column, value }),
        }
      ));
      if (result.analysis) {
        setDataset((previous) => ({ ...previous, analysis: result.analysis }));
      }
      loadAIInsights(dataset.dataset_id);
      setUploadMessage(`Saved row ${(dataset.row_indices?.[rowIndex] ?? (pageOffset + rowIndex)) + 1}, column "${column}".`);
      return true;
    } catch (error) {
      // Keep the user's local edit visible instead of reloading and silently
      // replacing it with the old backend value.
      setUploadMessage(`Save failed for "${column}": ${error.message}. Your visible edit was kept; click the cell and leave it again to retry.`);
      return false;
    }
  }

  function saveCellAndTrack(rowIndex, column, value) {
    const savePromise = handleCellSave(rowIndex, column, value);
    pendingCellSaves.current.add(savePromise);
    savePromise.finally(() => pendingCellSaves.current.delete(savePromise));
    return savePromise;
  }

  async function waitForPendingCellSaves() {
    const pending = [...pendingCellSaves.current];
    if (pending.length > 0) {
      await Promise.all(pending);
    }
  }

  async function handleAddRow() {
    await waitForPendingCellSaves();
    if (!dataset) return;
    setBusy(true);
    try {
      const row = Object.fromEntries(dataset.column_names.map((column) => [column, ""]));
      const result = await readJson(await fetch(
        `${API_URL}/api/dataset/${dataset.dataset_id}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ row }),
        }
      ));
      const lastOffset = Math.floor(Math.max(0, result.rows - 1) / PAGE_SIZE) * PAGE_SIZE;
      await loadPage(dataset.dataset_id, lastOffset, result);
      setChartMessage("Dataset changed. Generate the chart again to include the new row.");
      setUploadMessage("A new row was added to the complete dataset.");
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddColumn() {
    await waitForPendingCellSaves();
    if (!dataset) return;
    const enteredName = window.prompt("Enter the new column name:");
    if (!enteredName || !enteredName.trim()) return;
    setBusy(true);
    try {
      const result = await readJson(await fetch(
        `${API_URL}/api/dataset/${dataset.dataset_id}/columns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column: enteredName.trim() }),
        }
      ));
      await loadPage(dataset.dataset_id, pageOffset, result);
      setChartMessage("Dataset columns changed. Generate the chart again to refresh it.");
      setUploadMessage(`Column "${enteredName.trim()}" added to all rows.`);
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runCleaning(action, extra = {}) {
    await waitForPendingCellSaves();
    if (!dataset) return;
    setBusy(true);
    try {
      const result = await readJson(await fetch(
        `${API_URL}/api/dataset/${dataset.dataset_id}/clean`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        }
      ));
      const safeOffset = Math.floor(Math.max(0, result.rows - 1) / PAGE_SIZE) * PAGE_SIZE;
      const offset = Math.min(pageOffset, safeOffset);
      await loadPage(dataset.dataset_id, offset, result);
      setChartMessage("Dataset changed. Generate the chart again to refresh it.");
      if (action === "remove_duplicates") {
        setUploadMessage(`Removed ${result.removed} duplicate row(s) from the complete dataset.`);
      } else if (action === "remove_empty_rows") {
        setUploadMessage(`Removed ${result.removed} completely empty row(s) from the complete dataset.`);
      } else {
        setUploadMessage(`Filled ${result.filled} missing value(s) in "${extra.column}".`);
      }
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function handleRemoveDuplicates() {
    if (window.confirm("Remove duplicate rows from the entire dataset?")) {
      runCleaning("remove_duplicates");
    }
  }

  function handleRemoveEmptyRows() {
    if (window.confirm("Remove completely empty rows from the entire dataset?")) {
      runCleaning("remove_empty_rows");
    }
  }

  function handleFillMissingValues() {
    if (!dataset) return;
    const column = window.prompt(`Enter the exact column name:\n${dataset.column_names.join(", ")}`);
    if (column === null) return;
    if (!dataset.column_names.includes(column.trim())) {
      window.alert("Please enter an exact column name from the dataset.");
      return;
    }
    const value = window.prompt(`Enter the replacement value for "${column.trim()}":`);
    if (value !== null) runCleaning("fill_missing", { column: column.trim(), value });
  }

  async function handleResetChanges() {
    await waitForPendingCellSaves();
    if (!dataset || !window.confirm("Reset every edit and cleaning operation and restore the original uploaded dataset?")) return;
    setBusy(true);
    try {
      const result = await readJson(await fetch(
        `${API_URL}/api/dataset/${dataset.dataset_id}/reset`,
        { method: "POST" }
      ));
      await loadPage(dataset.dataset_id, 0, result);
      setChartRows([]);
      setChartMessage("Original dataset restored. Generate a new chart when ready.");
      setUploadMessage("The complete dataset has been restored to its original uploaded state.");
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportCSV() {
    await waitForPendingCellSaves();
    if (!dataset) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/dataset/${dataset.dataset_id}/export`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Export failed (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${dataset.filename.replace(/\.[^.]+$/, "")}-edited.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setUploadMessage("Complete edited dataset exported successfully.");
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateChart() {
    if (!dataset) return;
    if (!chartValueColumn) {
      setChartMessage("This dataset has no numeric column to plot. Add or choose a numeric column first.");
      return;
    }

    setIsGeneratingChart(true);
    setChartMessage("Loading all dataset rows for the chart...");
    try {
      const allRows = [];
      let totalRows = Number(dataset.rows) || 0;

      // Use the backend's total row count as the source of truth.
      for (let offset = 0; offset < totalRows; offset += CHART_FETCH_SIZE) {
        const page = await readJson(await fetch(
          `${API_URL}/api/dataset/${dataset.dataset_id}/rows?offset=${offset}&limit=${CHART_FETCH_SIZE}`
        ));

        if (Number.isFinite(Number(page.rows))) {
          totalRows = Number(page.rows);
        }

        const batch = Array.isArray(page.data) ? page.data : [];
        allRows.push(...batch);

        // Prevent an infinite loop if the backend unexpectedly returns no rows.
        if (batch.length === 0) break;
      }

      if (allRows.length !== totalRows) {
        throw new Error(
          `The backend reported ${totalRows} rows, but only ${allRows.length} rows were retrieved. Please retry.`
        );
      }

      setChartRows(allRows);
      setChartMessage(
        `Loaded all ${allRows.length.toLocaleString()} rows. Every valid numeric value will be included; large category lists are grouped into “Other” for readability.`
      );
    } catch (error) {
      setChartMessage(`Could not generate chart: ${error.message}`);
    } finally {
      setIsGeneratingChart(false);
    }
  }

  async function loadAIInsights(datasetId) {
    if (!datasetId) return;
    setInsightsLoading(true);
    try {
      const result = await readJson(await fetch(`${API_URL}/api/dataset/${datasetId}/insights`));
      setAiInsights(result.insights || []);
    } catch (error) {
      setAiInsights([]);
      setUploadMessage(`Could not load AI insights: ${error.message}`);
    } finally {
      setInsightsLoading(false);
    }
  }

  async function handleAskAI(event) {
    event?.preventDefault();
    const question = aiQuestion.trim();
    if (!question || isAskingAI) return;

    const historyForRequest = aiMessages.slice(-16);
    setAiMessages((previous) => [...previous, { role: "user", text: question }]);
    setAiQuestion("");
    setIsAskingAI(true);
    try {
      const result = await readJson(await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: historyForRequest,
          dataset_id: dataset?.dataset_id || null,
          model_tier: modelTier,
        }),
      }));
      setLastUsedModel(result.model || "");
      setAiMessages((previous) => [...previous, { role: "assistant", text: result.answer }]);
    } catch (error) {
      setAiMessages((previous) => [
        ...previous,
        { role: "error", text: `I couldn't answer that: ${error.message}` },
      ]);
    } finally {
      setIsAskingAI(false);
    }
  }

  function handleFileChange(event) {
    setSelectedFile(event.target.files?.[0] || null);
    setUploadMessage("");
  }

  const totalPages = dataset ? Math.max(1, Math.ceil(dataset.rows / PAGE_SIZE)) : 1;
  const currentDataPage = Math.floor(pageOffset / PAGE_SIZE) + 1;
  const analysis = dataset?.analysis;

  // Aggregate every valid numeric row from the complete dataset.
  // Large category sets are condensed into an "Other" bucket for readability,
  // without dropping their values from the chart total.
  const chartGroups = new Map();
  let chartValidRows = 0;
  let chartSkippedRows = 0;

  if (chartRows.length > 0 && chartValueColumn) {
    chartRows.forEach((row, index) => {
      const rawValue = row?.[chartValueColumn];
      const numericValue =
        rawValue === null || rawValue === undefined || String(rawValue).trim() === ""
          ? NaN
          : Number(String(rawValue).replace(/,/g, ""));

      if (!Number.isFinite(numericValue)) {
        chartSkippedRows += 1;
        return;
      }

      chartValidRows += 1;
      const rawLabel = chartLabelColumn
        ? row?.[chartLabelColumn]
        : `Row ${index + 1}`;
      const label =
        rawLabel === null || rawLabel === undefined || String(rawLabel).trim() === ""
          ? "(Blank)"
          : String(rawLabel);

      chartGroups.set(label, (chartGroups.get(label) || 0) + numericValue);
    });
  }

  const chartEntries = [...chartGroups.entries()];
  const chartCategoryLimit = chartType === "pie" ? 12 : 40;
  const sortedChartEntries =
    chartType === "line"
      ? chartEntries
      : [...chartEntries].sort((a, b) => b[1] - a[1]);

  const visibleChartEntries = (() => {
    if (sortedChartEntries.length <= chartCategoryLimit) return sortedChartEntries;

    const visible = sortedChartEntries.slice(0, chartCategoryLimit);
    const remainingTotal = sortedChartEntries
      .slice(chartCategoryLimit)
      .reduce((total, [, value]) => total + value, 0);

    return [...visible, [`Other (${sortedChartEntries.length - chartCategoryLimit} categories)`, remainingTotal]];
  })();

  // Distinct, coordinated colours for each chart type.
  const chartPalette = [
    "#4F46E5", "#06B6D4", "#10B981", "#F59E0B",
    "#EF4444", "#8B5CF6", "#EC4899", "#84CC16",
    "#F97316", "#14B8A6", "#6366F1", "#D946EF",
  ];

  const selectedLineColour =
    chartPalette[
      Math.abs(
        (chartValueColumn || "").split("").reduce((total, character) => total + character.charCodeAt(0), 0)
      ) % chartPalette.length
    ];

  const chartData = {
    labels: visibleChartEntries.map(([label]) => label),
    datasets: [
      {
        label: chartValueColumn ? `Total ${chartValueColumn}` : "Value",
        data: visibleChartEntries.map(([, value]) => Number(value.toFixed(3))),
        backgroundColor:
          chartType === "line"
            ? `${selectedLineColour}33`
            : visibleChartEntries.map((_, index) => chartPalette[index % chartPalette.length] + "CC"),
        borderColor:
          chartType === "line"
            ? selectedLineColour
            : visibleChartEntries.map((_, index) => chartPalette[index % chartPalette.length]),
        pointBackgroundColor: selectedLineColour,
        pointBorderColor: "#FFFFFF",
        pointRadius: chartType === "line" ? 4 : 0,
        borderWidth: chartType === "line" ? 3 : 1.5,
        tension: 0.3,
        hoverOffset: chartType === "pie" ? 12 : 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: chartType === "pie",
        position: "bottom",
      },
      title: {
        display: true,
        text: chartLabelColumn
          ? `${chartValueColumn} by ${chartLabelColumn}`
          : `${chartValueColumn} by Row`,
      },
    },
    scales:
      chartType === "pie"
        ? {}
        : {
            x: { ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true },
          },
  };

  return (
    <div className={`app ${theme === "dark" ? "theme-dark" : ""}`} data-theme={theme}>
      <header className="site-header">
        <button type="button" className="brand-lockup" onClick={() => setCurrentPage("home")} aria-label="DataPilot AI home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img">
              <defs>
                <linearGradient id="dpRobotGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#6d28d9" />
                </linearGradient>
              </defs>
              <path d="M24 5v5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="24" cy="5" r="2.3" fill="#c4b5fd" />
              <rect x="8" y="12" width="32" height="26" rx="9" fill="url(#dpRobotGradient)" stroke="white" strokeWidth="1.5" />
              <path d="M14 20h20" stroke="#ddd6fe" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
              <circle cx="18" cy="26" r="3" fill="white" />
              <circle cx="30" cy="26" r="3" fill="white" />
              <path d="M18 33c3.5 2.5 8.5 2.5 12 0" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M5 23h3M40 23h3" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="brand-copy">
            <strong>DataPilot<span> AI</span></strong>
            <small>Make data work for you</small>
          </span>
        </button>
        <nav className="site-nav" aria-label="Main navigation">
          <button type="button" className={currentPage === "home" ? "active" : ""} onClick={() => setCurrentPage("home")}>Home</button>
          <a href="#platform-features" onClick={() => setCurrentPage("home")}>Features</a>
          <button type="button" className={currentPage === "workspace" ? "active" : ""} onClick={() => setCurrentPage("workspace")}>Workspace</button>
          <a href="#about-datapilot" onClick={() => setCurrentPage("home")}>About</a>
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            aria-pressed={theme === "dark"}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            <span className="theme-toggle-label">{theme === "light" ? "Dark" : "Light"}</span>
          </button>
          <button type="button" className="header-cta" onClick={() => setCurrentPage("workspace")}>
            Open workspace <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      {currentPage === "home" ? (
        <main className="landing-page">
          <section className="landing-hero">
            <div className="hero-copy">
              <div className="eyebrow"><span /> AI-POWERED DATA WORKSPACE</div>
              <h1>Turn raw data into <span>clear decisions.</span></h1>
              <p className="hero-description">
                Upload your spreadsheets, clean messy data, explore trends and ask questions in plain language.
                DataPilot AI brings your data workflow together in one simple workspace.
              </p>
              <div className="hero-actions">
                <button type="button" className="hero-primary" onClick={() => setCurrentPage("workspace")}>Get started <span>→</span></button>
                <a href="#platform-features" className="hero-secondary">Explore features <span>↓</span></a>
              </div>
              <div className="hero-proof">
                <span className="proof-icon">✓</span>
                <span>CSV & Excel support</span>
                <i />
                <span>AI-assisted analysis</span>
              </div>
            </div>
            <div className="hero-visual" aria-label="Illustration of an analytics dashboard">
              <div className="visual-glow" />
              <div className="mock-window">
                <div className="mock-window-bar"><span /><span /><span /><b>Data overview</b><small>LIVE PREVIEW</small></div>
                <div className="mock-kpis">
                  <div><small>Total records</small><strong>12,480</strong><em>↑ 12.8%</em></div>
                  <div><small>Data quality</small><strong>98.4%</strong><em>↑ 4.2%</em></div>
                </div>
                <div className="mock-chart-title">Performance overview <small>Last 6 months</small></div>
                <div className="mock-chart">
                  {[38, 58, 47, 76, 62, 91, 70, 100, 82, 112, 94, 128].map((height, index) => <span key={index} style={{height: `${height}px`}} />)}
                </div>
                <div className="mock-table">
                  <div><b>Product</b><b>Revenue</b><b>Status</b></div>
                  <div><span>Product Alpha</span><span>$24,800</span><i>Healthy</i></div>
                  <div><span>Product Beta</span><span>$18,250</span><i>Healthy</i></div>
                  <div><span>Product Gamma</span><span>$12,600</span><i>Review</i></div>
                </div>
              </div>
              <div className="floating-insight"><span>✦</span><div><b>AI insight</b><small>Revenue is trending upward</small></div></div>
            </div>
          </section>

          <section className="landing-trust">
            <span>ONE WORKSPACE FOR YOUR DATA WORKFLOW</span>
            <div><b>UPLOAD</b><i>→</i><b>UNDERSTAND</b><i>→</i><b>IMPROVE</b><i>→</i><b>DECIDE</b></div>
          </section>

          <section className="features-section" id="platform-features">
            <div className="section-heading">
              <div className="eyebrow">WHAT YOU CAN DO</div>
              <h2>Everything you need to work with data.</h2>
              <p>From the first upload to the final insight, keep your workflow in one place.</p>
            </div>
            <div className="feature-grid">
              <article className="feature-card"><span className="feature-icon purple">▦</span><h3>Spreadsheet workspace</h3><p>Edit cells, add rows and columns, sort, filter, and copy or paste ranges with familiar spreadsheet controls.</p><small>EDIT · ORGANISE · EXPORT</small></article>
              <article className="feature-card"><span className="feature-icon blue">✦</span><h3>AI data analyst</h3><p>Ask questions in natural language, get help understanding your data, and explore automatic insights.</p><small>ASK · DISCOVER · UNDERSTAND</small></article>
              <article className="feature-card"><span className="feature-icon green">◒</span><h3>Interactive visualisations</h3><p>Create bar, line, and pie charts using columns from your uploaded dataset.</p><small>VISUALISE · COMPARE · EXPLAIN</small></article>
              <article className="feature-card"><span className="feature-icon amber">⌫</span><h3>Data cleaning</h3><p>Remove duplicate records, clear empty rows, fill missing values, or restore your original dataset.</p><small>FIX · CLEAN · RESTORE</small></article>
              <article className="feature-card"><span className="feature-icon cyan">⌁</span><h3>Dataset insights</h3><p>Review dataset summaries, missing values, numeric statistics, and automatic data-quality observations.</p><small>PROFILE · CHECK · LEARN</small></article>
              <article className="feature-card"><span className="feature-icon rose">⇩</span><h3>Export your work</h3><p>Download your edited dataset as a CSV file and continue working with it elsewhere.</p><small>DOWNLOAD · REUSE · SHARE</small></article>
            </div>
          </section>

          <section className="landing-workflow" id="about-datapilot">
            <div><div className="eyebrow">A CLEARER WAY TO WORK</div><h2>Less time wrestling with spreadsheets. More time finding answers.</h2><p>DataPilot AI combines familiar spreadsheet operations with AI assistance and visual analysis, so you can move from raw files to useful understanding without switching between multiple tools.</p><button type="button" className="hero-primary" onClick={() => setCurrentPage("workspace")}>Try the workspace <span>→</span></button></div>
            <div className="workflow-steps"><div><b>01</b><span><strong>Upload your file</strong><small>Start with a CSV or Excel dataset.</small></span></div><div><b>02</b><span><strong>Explore and prepare</strong><small>Edit, sort, filter and clean your data.</small></span></div><div><b>03</b><span><strong>Ask and visualise</strong><small>Use AI chat, insights and interactive charts.</small></span></div></div>
          </section>

          <section className="landing-bottom-cta">
            <div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Your next insight starts with a dataset.</h2><p>Open the workspace and start exploring your data.</p></div>
            <button type="button" className="hero-primary" onClick={() => setCurrentPage("workspace")}>Open DataPilot AI <span>→</span></button>
          </section>
        </main>
      ) : (
      <>
      <div className="workspace-page-heading">
        <div><div className="eyebrow">DATAPILOT AI WORKSPACE</div><h1>Your data, ready to explore.</h1><p>Upload a dataset or continue working with your current analysis.</p></div>
        <button type="button" className="workspace-back-link" onClick={() => setCurrentPage("home")}>← Back to home</button>
      </div>
      <main className="workspace">
        <section className="spreadsheet-panel">
          <div className="panel-heading">
            <h2>Data Workspace</h2>
            <p>Upload a dataset to explore and analyse all its rows.</p>
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
            {selectedFile && <p className="selected-file">Selected: {selectedFile.name}</p>}
            <button type="button" onClick={handleUpload} disabled={isUploading || !selectedFile}>
              {isUploading ? "Processing..." : "Upload Dataset"}
            </button>
            {uploadMessage && <p className="upload-message" role="status">{uploadMessage}</p>}
          </div>

          {!dataset && (
            <div className="empty-state">
              <div className="empty-icon">▦</div>
              <h3>Your data starts here</h3>
              <p>Upload a CSV or Excel file to view your data and begin analysing business performance.</p>
            </div>
          )}

          {dataset && (
            <section className="dataset-preview">
              <div className="dataset-toolbar-header">
                <div>
                  <h2>Interactive Spreadsheet</h2>
                  <p className="preview-note">
                    Explore, edit, analyse and clean your complete dataset.
                  </p>
                </div>
                <div className="dataset-file-label">
                  <span className="dataset-file-dot" />
                  {dataset.filename}
                </div>
              </div>

              <nav className="workspace-tabs" aria-label="Dataset workspace sections">
                {[
                  { id: "data", label: "Data", icon: "▦" },
                  { id: "analysis", label: "Analysis", icon: "▥" },
                  { id: "charts", label: "Charts", icon: "◒" },
                  { id: "cleaning", label: "Cleaning", icon: "✦" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`workspace-tab ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={activeTab === tab.id ? "page" : undefined}
                  >
                    <span aria-hidden="true">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </nav>

              {activeTab === "data" && (
                <section className="tab-content">
                  <div className="dataset-summary">
                    <div className="summary-card"><span>Filename</span><strong>{dataset.filename}</strong></div>
                    <div className="summary-card"><span>Total Rows</span><strong>{dataset.rows}</strong></div>
                    <div className="summary-card"><span>Total Columns</span><strong>{dataset.columns}</strong></div>
                  </div>

                  <div className="spreadsheet-toolbar">
                    <div>
                      <h3>Spreadsheet</h3>
                      <p className="preview-note">Select a cell to edit its value. Changes are saved to the dataset.</p>
                    </div>
                    <div className="spreadsheet-actions">
                      <button type="button" onClick={handleAddRow} disabled={busy}>＋ Add Row</button>
                      <button type="button" onClick={handleAddColumn} disabled={busy}>＋ Add Column</button>
                      <button type="button" onClick={handleExportCSV} disabled={busy}>↓ Export CSV</button>
                    </div>
                  </div>

                  <div className="spreadsheet-view-controls">
                    <div className="spreadsheet-control-group">
                      <label htmlFor="sort-column">Sort column</label>
                      <select id="sort-column" value={sortColumn} onChange={(event) => setSortColumn(event.target.value)}>
                        <option value="">No sorting</option>
                        {dataset.column_names.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                      <select aria-label="Sort direction" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                        <option value="asc">A–Z / Smallest first</option>
                        <option value="desc">Z–A / Largest first</option>
                      </select>
                      <button type="button" onClick={() => applySpreadsheetView()}>Apply sort</button>
                    </div>
                    <div className="spreadsheet-control-group">
                      <label htmlFor="filter-column">Filter column</label>
                      <select id="filter-column" value={filterColumn} onChange={(event) => setFilterColumn(event.target.value)}>
                        <option value="">Choose column</option>
                        {dataset.column_names.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                      <input aria-label="Filter value" placeholder="Contains..." value={filterValue} onChange={(event) => setFilterValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySpreadsheetView(); }} />
                      <button type="button" onClick={() => applySpreadsheetView()}>Apply filter</button>
                      <button type="button" className="secondary-control" onClick={() => applySpreadsheetView({ sortColumn: "", sortOrder: "asc", filterColumn: "", filterValue: "" })}>Clear</button>
                    </div>
                  </div>

                  <div className="formula-bar" aria-label="Spreadsheet formula bar">
                <div className="cell-reference">
                  {selectedColumn
                    ? `${getColumnLetter(selectedCell.colIndex)}${(dataset.row_indices?.[selectedCell.rowIndex] ?? (pageOffset + selectedCell.rowIndex)) + 1}`
                    : "—"}
                </div>
                <span className="formula-symbol">fx</span>
                <input
                  type="text"
                  aria-label="Selected cell value"
                  placeholder="Select a cell to view or edit its value"
                  value={selectedCellValue}
                  disabled={!dataset || !selectedColumn}
                  onChange={(event) => updateSelectedCellValue(event.target.value)}
                  onBlur={() => {
                    if (selectedColumn) {
                      saveCellAndTrack(selectedCell.rowIndex, selectedColumn, selectedCellValue);
                    }
                  }}
                />
              </div>

              {isLoadingPage ? <p>Loading rows...</p> : (
                <div className="table-container">
                  {dataset.column_names.length > 0 ? (
                    <table className="data-table spreadsheet-grid" onMouseUp={() => { isSelectingRange.current = false; }}>
                      <thead>
                        <tr>
                          <th className="row-number-heading" aria-label="Row number">#</th>
                          {dataset.column_names.map((column, index) => (
                            <th key={index} tabIndex={0} className={`resizable-column ${normalizeRange(selectedRange).left <= index && normalizeRange(selectedRange).right >= index ? "range-header-selected" : ""}`} style={{ width: columnWidths[column] || 145, minWidth: columnWidths[column] || 145 }} onClick={(event) => { const range = { startRow: 0, endRow: dataset.preview.length - 1, startCol: event.shiftKey ? selectedCell.colIndex : index, endCol: index }; setSelectedRange(range); setSelectedCell({ rowIndex: 0, colIndex: index }); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") copySpreadsheetColumn(event, index); }}>
                              <span className="column-letter" onDoubleClick={(event) => copySpreadsheetColumn(event, index)} title="Click to select column; double-click to copy">{getColumnLetter(index)}</span>
                              <span className="column-name">{column}</span>
                              <span className="column-resize-handle" role="separator" aria-orientation="vertical" aria-label={`Resize ${column} column`} onMouseDown={(event) => startColumnResize(event, column)} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataset.preview.map((row, rowIndex) => (
                          <tr key={dataset.row_indices?.[rowIndex] ?? (pageOffset + rowIndex)}>
                            <th
                              className={`row-number-cell ${normalizeRange(selectedRange).top <= rowIndex && normalizeRange(selectedRange).bottom >= rowIndex && normalizeRange(selectedRange).left === 0 && normalizeRange(selectedRange).right === dataset.column_names.length - 1 ? "selected-row-for-copy" : ""}`}
                              scope="row"
                              tabIndex={0}
                              title="Click to select this row; press Ctrl+C to copy it"
                              onClick={(event) => { const range = { startRow: event.shiftKey ? selectedCell.rowIndex : rowIndex, endRow: rowIndex, startCol: 0, endCol: dataset.column_names.length - 1 }; setSelectedRange(range); setSelectedCell({ rowIndex, colIndex: 0 }); setSelectedRowForCopy(rowIndex); }}
                              onKeyDown={(event) => {
                                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                                  copySpreadsheetRow(event, rowIndex);
                                }
                              }}
                            >
                              {(dataset.row_indices?.[rowIndex] ?? (pageOffset + rowIndex)) + 1}
                            </th>
                            {dataset.column_names.map((column, colIndex) => (
                              <td
                                key={colIndex}
                                className={
                                  selectedCell.rowIndex === rowIndex &&
                                  selectedCell.colIndex === colIndex
                                    ? "selected-cell"
                                    : ""
                                }
                              >
                                <input
                                  className={`spreadsheet-cell ${(() => { const r = normalizeRange(selectedRange); return rowIndex >= r.top && rowIndex <= r.bottom && colIndex >= r.left && colIndex <= r.right ? "range-selected" : ""; })()}`}
                                  type="text"
                                  data-row-index={rowIndex}
                                  data-col-index={colIndex}
                                  aria-label={`Row ${(dataset.row_indices?.[rowIndex] ?? (pageOffset + rowIndex)) + 1}, ${column}`}
                                  value={row[column] == null ? "" : String(row[column])}
                                  onFocus={() => setSelectedCell({ rowIndex, colIndex })}
                                  onMouseDown={() => { isSelectingRange.current = true; setSelectedRange({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex }); }}
                                  onMouseEnter={() => { if (isSelectingRange.current) setSelectedRange((range) => ({ ...range, endRow: rowIndex, endCol: colIndex })); }}
                                  onKeyDown={(event) => {
                                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                                      const r = normalizeRange(selectedRange);
                                      if (r.top !== r.bottom || r.left !== r.right) copySelectedRange(event);
                                    } else {
                                      handleSpreadsheetKeyDown(event, rowIndex, colIndex);
                                    }
                                  }}
                                  onPaste={(event) => handleSpreadsheetPaste(event, rowIndex, colIndex)}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setDataset((previous) => ({
                                      ...previous,
                                      preview: previous.preview.map((item, index) =>
                                        index === rowIndex ? { ...item, [column]: value } : item
                                      ),
                                    }));
                                  }}
                                  onBlur={(event) => saveCellAndTrack(rowIndex, column, event.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p>This dataset has no columns to display.</p>}
                </div>
              )}
              <div className="spreadsheet-pagination">
                <span>Showing {dataset.rows === 0 ? 0 : pageOffset + 1}–{Math.min(pageOffset + PAGE_SIZE, dataset.rows)} of {dataset.rows} matching rows</span>
                <div>
                  <button type="button" disabled={currentDataPage <= 1 || isLoadingPage} onClick={() => loadPage(dataset.dataset_id, Math.max(0, pageOffset - PAGE_SIZE))}>← Previous</button>
                  <span>Page {currentDataPage} of {totalPages}</span>
                  <button type="button" disabled={currentDataPage >= totalPages || isLoadingPage} onClick={() => loadPage(dataset.dataset_id, pageOffset + PAGE_SIZE)}>Next →</button>
                </div>
              </div>
              <p className="preview-note">Tip: edit a cell, then click or tab away. Your edit is saved before other spreadsheet operations run.</p>
                </section>
              )}

              {activeTab === "analysis" && (
                <section className="tab-content">
                  {analysis && (
                <section className="analysis-summary">
                  <h3>Full Dataset Analysis</h3>
                  <p className="preview-note">Statistics are calculated by the backend across every row, not just the current page.</p>
                  <div className="dataset-summary">
                    <div className="summary-card"><span>Numeric Columns</span><strong>{analysis.numeric_columns}</strong></div>
                    <div className="summary-card"><span>Text Columns</span><strong>{analysis.text_columns}</strong></div>
                    <div className="summary-card"><span>Missing Values</span><strong>{analysis.total_missing_values}</strong></div>
                  </div>

                  {Object.keys(analysis.numeric_summary || {}).length > 0 && (
                    <>
                      <h3>Numeric Statistics</h3>
                      <div className="table-container">
                        <table className="data-table">
                          <thead><tr><th>Column</th><th>Mean</th><th>Minimum</th><th>Maximum</th><th>Standard Deviation</th></tr></thead>
                          <tbody>
                            {Object.entries(analysis.numeric_summary).map(([column, stats]) => (
                              <tr key={column}>
                                <td>{column}</td><td>{stats.mean ?? "—"}</td><td>{stats.minimum ?? "—"}</td>
                                <td>{stats.maximum ?? "—"}</td><td>{stats.standard_deviation ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {analysis.missing_by_column && (
                    <>
                      <h3>Missing Values by Column</h3>
                      <div className="table-container">
                        <table className="data-table">
                          <thead><tr><th>Column</th><th>Missing Values</th></tr></thead>
                          <tbody>
                            {Object.entries(analysis.missing_by_column).map(([column, count]) => (
                              <tr key={column}><td>{column}</td><td>{count}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}
                </section>
              )}

              {activeTab === "charts" && (
                <section className="tab-content">
                  <section className="analysis-summary chart-section">
                <h3>Interactive Data Visualization</h3>
                <p className="preview-note">
                  Create charts from the complete dataset. Values are grouped and summed by the selected label column.
                </p>

                <div className="chart-controls">
                  <label>
                    Chart type
                    <select value={chartType} onChange={(event) => setChartType(event.target.value)}>
                      <option value="bar">Bar Chart</option>
                      <option value="line">Line Chart</option>
                      <option value="pie">Pie Chart</option>
                    </select>
                  </label>

                  <label>
                    Category / label column
                    <select value={chartLabelColumn} onChange={(event) => setChartLabelColumn(event.target.value)}>
                      <option value="">Use row number</option>
                      {dataset.column_names.map((column) => (
                        <option key={column} value={column}>{column}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Numeric value column
                    <select value={chartValueColumn} onChange={(event) => setChartValueColumn(event.target.value)}>
                      <option value="">Select numeric column</option>
                      {dataset.column_names.map((column) => (
                        <option key={column} value={column}>{column}</option>
                      ))}
                    </select>
                  </label>

                  <button type="button" onClick={handleGenerateChart} disabled={isGeneratingChart || !chartValueColumn}>
                    {isGeneratingChart ? "Generating..." : "Generate Chart"}
                  </button>
                </div>

                {chartMessage && <p className="upload-message" role="status">{chartMessage}</p>}

                {chartRows.length > 0 && visibleChartEntries.length > 0 ? (
                  <>
                  <p className="preview-note chart-data-coverage">
                    Included {chartValidRows.toLocaleString()} valid rows out of {chartRows.length.toLocaleString()} total rows
                    {chartSkippedRows > 0
                      ? ` · ${chartSkippedRows.toLocaleString()} rows had blank or non-numeric values and were excluded`
                      : " · No rows were excluded"}
                    {chartEntries.length > visibleChartEntries.length - 1
                      ? ` · Remaining categories are combined into Other`
                      : ""}
                  </p>
                  <div className="chart-container" style={{ height: "380px", position: "relative" }}>
                    {chartType === "bar" && <Bar data={chartData} options={chartOptions} />}
                    {chartType === "line" && <Line data={chartData} options={chartOptions} />}
                    {chartType === "pie" && <Pie data={chartData} options={chartOptions} />}
                  </div>
                  </>
                ) : (
                  <div className="empty-state chart-empty-state">
                    <h3>Your chart will appear here</h3>
                    <p>Choose a numeric column and click Generate Chart.</p>
                  </div>
                )}
                {chartType === "pie" && visibleChartEntries.length > 0 && (
                  <p className="preview-note">Pie charts display up to 12 categories, ordered by their total value.</p>
                )}
                {chartType !== "pie" && visibleChartEntries.length > 0 && (
                  <p className="preview-note">Bar and line charts display up to 40 categories in dataset order.</p>
                )}
              </section>
                </section>
              )}

              {activeTab === "cleaning" && (
                <section className="tab-content cleaning-workspace">
                  <div className="cleaning-intro">
                    <h3>Data cleaning tools</h3>
                    <p className="preview-note">
                      Clean the complete dataset. These operations affect all rows, not only the visible page.
                    </p>
                  </div>
                  <div className="cleaning-grid">
                    <article className="cleaning-card">
                      <div className="cleaning-card-icon">⧉</div>
                      <h4>Remove duplicates</h4>
                      <p>Find and remove duplicate records from your dataset.</p>
                      <button type="button" onClick={handleRemoveDuplicates} disabled={busy}>Remove duplicates</button>
                    </article>
                    <article className="cleaning-card">
                      <div className="cleaning-card-icon">⌫</div>
                      <h4>Remove empty rows</h4>
                      <p>Remove rows that contain no data.</p>
                      <button type="button" onClick={handleRemoveEmptyRows} disabled={busy}>Remove empty rows</button>
                    </article>
                    <article className="cleaning-card">
                      <div className="cleaning-card-icon">✎</div>
                      <h4>Fill missing values</h4>
                      <p>Replace blank values in a selected column.</p>
                      <button type="button" onClick={handleFillMissingValues} disabled={busy}>Fill missing values</button>
                    </article>
                    <article className="cleaning-card cleaning-card-warning">
                      <div className="cleaning-card-icon">↶</div>
                      <h4>Reset dataset</h4>
                      <p>Restore the original uploaded data and discard edits.</p>
                      <button type="button" onClick={handleResetChanges} disabled={busy}>Reset changes</button>
                    </article>
                  </div>
                  {busy && <p className="ai-muted" role="status">Updating your dataset…</p>}
                </section>
              )}

            </section>
          )}
        </section>

        <aside className="chat-panel">
          <div className="ai-panel-heading">
            <div>
              <h2><span className="ai-sparkle">✦</span> AI Business Analyst</h2>
              <p>Your general-purpose AI assistant, with optional dataset awareness</p>
            </div>
            <span className="ai-status">● Ready</span>
          </div>

          <section className="insights-section">
            <div className="ai-section-title">
              <h3>Automatic insights</h3>
              <button type="button" className="text-button" disabled={!dataset || insightsLoading} onClick={() => loadAIInsights(dataset?.dataset_id)}>
                {insightsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {!dataset ? <p className="ai-muted">Upload a dataset to discover patterns and data quality issues.</p> : aiInsights.length === 0 ? <p className="ai-muted">{insightsLoading ? "Analysing your dataset..." : "No insights available yet."}</p> : (
              <div className="insight-list">
                {aiInsights.map((insight, index) => (
                  <article className={`insight-card insight-${insight.type}`} key={`${insight.title}-${index}`}>
                    <strong>{insight.title}</strong>
                    <p>{insight.description}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="ai-chat-section">
            <h3>Chat with DataPilot AI</h3>

            <div
              className="model-tier-control"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                margin: "10px 0 14px",
              }}
            >
              <label htmlFor="ai-model-tier" style={{ fontWeight: 600 }}>
                AI model
              </label>
              <select
                id="ai-model-tier"
                value={modelTier}
                onChange={(event) => setModelTier(event.target.value)}
                disabled={isAskingAI}
                aria-label="Choose AI model"
              >
                <option value="basic">Basic — faster, lighter</option>
                <option value="advanced">Advanced — more capable</option>
              </select>
            </div>
            {lastUsedModel && (
              <p className="ai-muted" style={{ margin: "0 0 10px", fontSize: "12px" }}>
                Last response used: {lastUsedModel}
              </p>
            )}

            <div className="ai-message-list">
              {aiMessages.length === 0 ? (
                <div className="suggested-questions">
                  <p>Hi! I'm DataPilot AI. Ask me about anything, or upload a dataset for data-aware answers.</p>
                  {["Explain artificial intelligence in simple words.", "Help me write a Python function.", "Give me business growth strategies.", "Summarise my uploaded dataset."] .map((question) => (
                    <button type="button" key={question} onClick={() => setAiQuestion(question)}>{question}</button>
                  ))}
                </div>
              ) : aiMessages.map((message, index) => (
                <div className={`ai-message ${message.role}`} key={index}>
                  <span>
                    {message.role === "user"
                      ? "You"
                      : message.role === "error"
                        ? "Notice"
                        : "DataPilot AI"}
                  </span>
                  <div className="ai-message-content">
                    {message.role === "user" ? (
                      <p>{message.text}</p>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {isAskingAI && <p className="ai-muted">Analysing your question...</p>}
            </div>
            <form className="ai-question-form" onSubmit={handleAskAI}>
              <input
                type="text"
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
                placeholder={dataset ? "Ask anything or ask about your data..." : "Ask DataPilot AI anything..."}
                disabled={isAskingAI}
                maxLength={4000}
              />
              <button className="secondary-button" type="submit" disabled={!aiQuestion.trim() || isAskingAI}>
                {isAskingAI ? "..." : "Ask"}
              </button>
            </form>
            <p className="ai-disclaimer">Powered by Google Gemini. Chat works without a dataset; upload one to give the assistant additional context. Avoid sharing sensitive or confidential data.</p>
          </section>
        </aside>
      </main>
      </>
      )}

      <footer className="footer site-footer">
        <p>© {new Date().getFullYear()} <strong>DataPilot AI</strong> · Make data work for you.</p>
        {currentPage === "workspace" ? (
          <span className="footer-status">Backend: <strong>{backendStatus}</strong>
            <button type="button" onClick={checkBackend} disabled={isChecking}>{isChecking ? "Checking..." : "Test connection"}</button>
          </span>
        ) : (
          <span>Built for clearer, more confident data decisions.</span>
        )}
      </footer>
    </div>
  );
}

export default App;
