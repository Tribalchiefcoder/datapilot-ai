# DataPilot AI

**An AI-powered data analytics workspace that turns raw CSV and Excel data into meaningful insights.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20DataPilot%20AI-7c3aed?style=for-the-badge)](https://datapilot-ai-lemon.vercel.app/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github)](https://github.com/Tribalchiefcoder/datapilot-ai)

DataPilot AI is a full-stack data analytics application designed to simplify data exploration, cleaning, visualization, and analysis. It combines Python-powered data processing with an interactive React dashboard and Google Gemini AI to help users understand their datasets more efficiently.

## 🚀 Live Application

**Try DataPilot AI:** https://datapilot-ai-lemon.vercel.app/

Upload a CSV or Excel dataset and explore its contents through interactive analytics, charts, data-cleaning tools, and AI-powered conversations.

## ✨ Features

### 📂 Dataset Management
- Upload CSV and Excel (`.xlsx`) files.
- File upload limit of 10 MB.
- Explore dataset rows and columns.
- Paginated spreadsheet interface.
- Add new rows and columns.
- Edit individual cell values.
- Export processed datasets as CSV.

### 📊 Data Analytics & Visualization
- Automatic dataset analysis.
- Numeric and text column detection.
- Missing-value analysis.
- Dataset statistics and insights.
- Interactive charts powered by Chart.js.
- Visual exploration of data patterns.

### 🧹 Data Cleaning
- Remove duplicate records.
- Remove empty rows.
- Handle missing values.
- Reset dataset changes.

### 🤖 AI Business Analyst
- Ask questions about uploaded datasets.
- Generate AI-powered data insights.
- General-purpose AI conversations.
- Dataset-aware question answering.
- Basic and Advanced AI model selection.
- Powered by Google Gemini.

### 🎨 User Interface
- Modern React-based dashboard.
- Light and dark themes.
- Responsive interface.
- Interactive spreadsheet workspace.

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript |
| Styling | CSS |
| Data Visualization | Chart.js, React Chart.js 2 |
| Backend | Python, Flask |
| Data Processing | Pandas, NumPy |
| Excel Support | OpenPyXL |
| AI Integration | Google Gemini API |
| API Communication | REST API, Flask-CORS |
| Production Server | Gunicorn |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Version Control | Git, GitHub |

## 🏗️ System Architecture

```text
              USER
                |
                v
       React + Vite Frontend
             Vercel
                |
          REST API Requests
                |
                v
          Flask Backend
             Render
                |
       +--------+---------+
       |                  |
       v                  v
  Pandas / OpenPyXL   Google Gemini
  Data Processing      AI Services
       |                  |
       +--------+---------+
                |
                v
       Analytics & Results
                |
                v
        React Dashboard
```

## 💻 Run Locally

Follow these steps to run DataPilot AI on your computer.

### Prerequisites

- Python 3
- Node.js and npm
- Git
- Google Gemini API key (for AI functionality)

### 1. Clone the repository

```bash
git clone https://github.com/Tribalchiefcoder/datapilot-ai.git
cd datapilot-ai
```

### 2. Set up the backend

```bash
cd backend

python -m venv .venv

source .venv/bin/activate

pip install -r requirements.txt
```

Create a file named `.env` inside the `backend` directory:

```env
GEMINI_API_KEY=your_gemini_api_key

GEMINI_BASIC_MODEL=gemini-3.1-flash-lite

GEMINI_ADVANCED_MODEL=gemini-3.8-flash
```

Start the Flask backend:

```bash
python app.py
```

The backend will run at:

`http://127.0.0.1:5000`

### 3. Set up the frontend

Open another terminal:

```bash
cd datapilot-ai/frontend

npm install

npm run dev
```

Open the local Vite URL displayed in your terminal, normally:

`http://localhost:5173`

The frontend uses the local backend URL by default.

## ⚙️ Environment Variables

### Backend

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_BASIC_MODEL` | Basic AI model identifier |
| `GEMINI_ADVANCED_MODEL` | Advanced AI model identifier |
| `FRONTEND_URL` | Allowed production frontend origin for CORS |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL |

For production deployment, configure:

**Vercel**

```env
VITE_API_URL=https://datapilot-ai-kl40.onrender.com
```

**Render**

```env
FRONTEND_URL=https://datapilot-ai-lemon.vercel.app
```

Keep API keys and other secrets in the hosting platform's environment-variable settings. Never commit them to GitHub.

## 🌐 Deployment

DataPilot AI is deployed using:

- **Frontend:** Vercel
- **Backend:** Render
- **Source Code:** GitHub

Live frontend: https://datapilot-ai-lemon.vercel.app/

Backend health endpoint: https://datapilot-ai-kl40.onrender.com/api/health

## ⚠️ Current Limitations

- Uploaded datasets are stored in backend memory rather than a persistent database.
- Dataset information can be lost when the backend restarts or the service spins down.
- Render's free instance may sleep after inactivity, causing a delay on the first request.
- AI functionality depends on Google Gemini API availability and usage limits.
- Uploaded files are limited to 10 MB.

## 🔮 Future Improvements

- Persistent database integration.
- User authentication and dataset management.
- PDF and Excel report generation.
- Advanced statistical analysis.
- More visualization options.
- Improved AI-generated reports.
- Background processing for larger datasets.

## 👨‍💻 Author

**Tribalchiefcoder**

GitHub: https://github.com/Tribalchiefcoder

## 📄 License

No license has been specified for this repository yet.

---

**DataPilot AI — Make data work for you.**
