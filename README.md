# Serverless Enterprise Cost Management Dashboard

## Executive Summary
This project is a fully functional, sanitised prototype of an enterprise-grade Cost Management Dashboard. It was engineered to replace a highly manual, legacy reporting process (historically reliant on a 40-tab Excel workbook, heavy VBA scripting, and disconnected Power Query models) with a streamlined, serverless cloud architecture.

The application provides department heads and controlling teams with a live, consolidated view of actuals versus plan, dynamic currency conversion, and automated anomaly detection for SAP invoice data.

## Technical Architecture
The solution leverages Google Cloud Platform (GCP) for heavy data processing and Google Workspace for a lightweight, serverless frontend and state management.

* **Data Warehouse (BigQuery):** Acts as the single source of truth. Raw SAP extracts and plan data are ingested here. Complex SQL views handle the normalisation, deduplication, and hierarchical mapping of cost centres and general ledger accounts.
* **Backend Logic (Google Apps Script):** Serves as the middleware. It securely queries BigQuery via the advanced `v2` REST API, processes the JSON payloads, and handles user authentication seamlessly.
* **Frontend UI (HTML/CSS/Vanilla JS):** A responsive, single-page web application. It utilises Google Charts for rendering trendlines and dynamic DOM manipulation for data tables, entirely bypassing the need for external hosting or Node.js servers.
* **Audit Trail (Google Sheets):** Acts as a live, write-back database to capture user commentary and control audit logs, providing immediate visibility into manual adjustments.

## Key Features
1. **Dynamic Data Routing:** Cross-departmental querying (IT, Marketing, Sales, Corporate Affairs) with granular regional filtering.
2. **Automated Anomaly Detection:** A built-in Controlling Auditor module that runs partition-based SQL scans across thousands of invoices to flag duplicate payments, split invoices, and suspicious round-number transactions.
3. **Live Currency Conversion:** Global toggles for assessing budget impact in either local currency (€) or USD ($), applied instantly across all datasets.
4. **Secure Proxy Execution:** The application executes under the developer's cloud credentials, allowing end-users to interrogate the database securely without requiring direct IAM permissions in GCP.

## Repository Structure
* `/database-sql`: Contains the BigQuery DML and View scripts used to map raw SAP data into aggregate models.
* `/backend-apps-script`: Contains the Google Apps Script (`.gs`) middleware bridging the UI and the data warehouse.
* `/frontend-ui`: Contains the markup and client-side logic for the dashboard interface.
* `/sample-data`: Sanitised CSV extracts demonstrating the expected schema for ingestion.

## 💡 Business Impact
By migrating from desktop-bound spreadsheets to this cloud-native pipeline, reporting latency is reduced from days to seconds. It removes single points of failure associated with local VBA scripts and provides a scalable, auditable framework for global financial tracking.
