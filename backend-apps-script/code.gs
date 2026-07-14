const PROJECT_ID = 'emagine-portfolio-cmd';
const AUDIT_SHEET_ID = "1tCt3Cc8dPm3nQPyfJgvjG6DjSfN9EV8dTVUCQRy4S6Q";

function doGet(e) {
  // Set default to IT where our dummy data lives
  let requestedDept = 'IT';
  if (e && e.parameter && e.parameter.dept) requestedDept = e.parameter.dept;
 
  let isAdmin = false;
  if (e && e.parameter && e.parameter.admin === 'true') isAdmin = true;
 
  let template = HtmlService.createTemplateFromFile('Index');
  template.lockedDepartment = requestedDept;
  template.isAdmin = isAdmin ? 'true' : 'false';
  return template.evaluate().setTitle('Department Dashboard Hub').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDepartmentsList() {
  return ['IT', 'Marketing', 'Sales'];
}

function getDashboardData(selectedDepartment, selectedCountry, selectedCurrency, selectedRegion) {
  if (!selectedDepartment || selectedDepartment === 'undefined') selectedDepartment = 'IT';
  if (!selectedCountry) selectedCountry = 'Region_A';
  if (!selectedCurrency) selectedCurrency = 'USD';
  if (!selectedRegion) selectedRegion = 'All';
 
  // Base data is stored in EUR. Inflate to USD using an exchange rate (e.g., 0.89 EUR to 1 USD)
  const isUSD = (selectedCurrency === 'USD');
  const exchangeRate = isUSD ? 0.89 : 1.0; 
  
  // Dashboard numbers are divided by scaleFactor to show in thousands (k)
  const scaleFactor = 1000 * exchangeRate;
  const summaryQuery = `SELECT Month, CY_Actuals, Plan_Amount, PY_Actuals FROM \`cmd_dataset.WebApp_Department_Summary\` WHERE Department = '${selectedDepartment}' AND Country = '${selectedCountry}' ORDER BY Month;`;
  const summaryRows = runBigQuery(summaryQuery);
 
  let summary = {cy: Array(12).fill(0), plan: Array(12).fill(0), py: Array(12).fill(0), cePlan: Array(12).fill(0), deltaPlan: Array(13).fill(""), deltaPy: Array(13).fill(""), deltaCe: Array(13).fill("")};
  summaryRows.forEach(row => {
    let mIndex = parseInt(row[0]) - 1;
    if(mIndex >= 0 && mIndex <= 11) {
      summary.cy[mIndex] = (parseFloat(row[1]) || 0) / scaleFactor;
      summary.plan[mIndex] = (parseFloat(row[2]) || 0) / scaleFactor;
      summary.py[mIndex] = (parseFloat(row[3]) || 0) / scaleFactor;
    }
  });
 
  let ceDeptName = selectedDepartment;
  if (selectedDepartment === 'IT') ceDeptName = 'Administration and IT';
  
  // Genericized deduction targets for portfolio display
  const ceDeductions = {'Logistics': 0.0030, 'Payroll': 0.0300, 'Accounts & Finance': 0.0045, 'Marketing': 0.0389, 'Sales': 0.0150, 'GRC': 0.0300, 'HR': 0.0300, 'Procurement': 0.0379, 'IT': 0.0300, 'PFM': 0.0388, 'Quality': 0.0150, 'Corporate Affairs': 0.0375, 'Brand Embassy': 0.0389, 'Controlling': 0.0000};
  let deductionRate = ceDeductions[selectedDepartment] || 0;
  for (let i = 0; i < 12; i++) {
    summary.cePlan[i] = summary.plan[i] * (1 - deductionRate);
  }
 
  let currentMonthIdx = -1;
  for (let i = 11; i >= 0; i--) {
    if (summary.cy[i] !== 0) { currentMonthIdx = i; break; }
  }
  if (currentMonthIdx === -1) currentMonthIdx = 0;
 
  summary.cy[12] = summary.cy.reduce((a,b)=>a+b, 0);
  summary.plan[12] = summary.plan.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b, 0);
  summary.py[12] = summary.py.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b, 0);
  summary.cePlan[12] = summary.cePlan.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b, 0);
 
  for(let i=0; i<13; i++) {
    summary.deltaPlan[i] = (summary.cy[i] !== 0 && summary.plan[i] !== 0) ? formatDelta(summary.cy[i] - summary.plan[i]) : "";
    summary.deltaPy[i] = (summary.cy[i] !== 0 && summary.py[i] !== 0) ? formatDelta(summary.cy[i] - summary.py[i]) : "";
    summary.deltaCe[i] = (summary.cy[i] !== 0 && summary.cePlan[i] !== 0) ? formatDelta(summary.cy[i] - summary.cePlan[i]) : "";
  }
 
  let regionFilter = "";
  if (selectedRegion !== 'All') {
    regionFilter = `AND UPPER(TRIM(Region)) = '${selectedRegion.toUpperCase()}'`;
  }
 
  const accQuery = `SELECT Int_Account_2_Desc, Cost_Category_desc, Month, CY_Actuals, Plan_Amount, PY_Actuals FROM \`cmd_dataset.WebApp_Account_Breakdown\` WHERE Department = '${selectedDepartment}' AND Country = '${selectedCountry}' ${regionFilter} ORDER BY Int_Account_2_Desc, Cost_Category_desc, Month;`;
  const accRows = runBigQuery(accQuery);
 
  let dashMap = {};
  let analysisMap = {};
  accRows.forEach(row => {
    let parentAcc = row[0] || "Unknown";
    let subCat = row[1] || "#";
    let mIndex = parseInt(row[2]) - 1;
    if(mIndex >= 0 && mIndex <= 11) {
      let cy = (parseFloat(row[3]) || 0) / scaleFactor;
      let plan = (parseFloat(row[4]) || 0) / scaleFactor;
      let py = (parseFloat(row[5]) || 0) / scaleFactor;
      if(!dashMap[parentAcc]) dashMap[parentAcc] = { name: parentAcc, cy: Array(12).fill(0), plan: Array(12).fill(0), py: Array(12).fill(0), comment: "" };
      dashMap[parentAcc].cy[mIndex] += cy;
      dashMap[parentAcc].plan[mIndex] += plan;
      dashMap[parentAcc].py[mIndex] += py;
      let analysisKey = parentAcc + "|" + subCat;
      if(!analysisMap[analysisKey]) analysisMap[analysisKey] = { parent: parentAcc, name: subCat, cy: Array(12).fill(0), plan: Array(12).fill(0), py: Array(12).fill(0), comment: "" };
      analysisMap[analysisKey].cy[mIndex] += cy;
      analysisMap[analysisKey].plan[mIndex] += plan;
      analysisMap[analysisKey].py[mIndex] += py;
    }
  });
 
  let latestComments = {};
  try {
    const sheet = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      let cCountry = data[i][2]; let cDept = data[i][3]; let cAcc = data[i][4]; let cText = data[i][6];
      if (cDept === selectedDepartment && cCountry === selectedCountry) latestComments[cAcc] = cText;
    }
  } catch(e) { }
 
  let accounts = Object.values(dashMap).map(acc => {
    let cyYtd = acc.cy.reduce((a,b)=>a+b,0);
    let planYtd = acc.plan.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b,0);
    let pyYtd = acc.py.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b,0);
    acc.cy.push(cyYtd); acc.plan.push(planYtd); acc.py.push(pyYtd);
    acc.deltaYtd = formatDelta(cyYtd - planYtd);
    acc.deltaMonth = formatDelta(acc.cy[currentMonthIdx] - acc.plan[currentMonthIdx]);
    acc.comment = latestComments[acc.name] || "";
    return acc;
  });
 
  let analysisDetails = Object.values(analysisMap).map(acc => {
    let cyYtd = acc.cy.reduce((a,b)=>a+b,0);
    let planYtd = acc.plan.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b,0);
    let pyYtd = acc.py.slice(0, currentMonthIdx + 1).reduce((a,b)=>a+b,0);
    acc.cy.push(cyYtd); acc.plan.push(planYtd); acc.py.push(pyYtd);
    acc.deltaYtd = formatDelta(cyYtd - planYtd);
    acc.deltaMonth = formatDelta(acc.cy[currentMonthIdx] - acc.plan[currentMonthIdx]);
    let accountIdentifier = acc.parent + " - " + acc.name;
    acc.comment = latestComments[accountIdentifier] || "";
    return acc;
  });
 
  const regionQuery = `SELECT CASE WHEN UPPER(TRIM(Supplier)) LIKE 'HQ%' THEN 'HQ' ELSE UPPER(SUBSTR(TRIM(Supplier), 1, 3)) END AS Region, SUM(Actuals) AS CY_Actuals FROM \`emagine-portfolio-cmd.cmd_dataset.Department_Commentary_Extract\` WHERE Financial_Year = 2026 AND Department = '${selectedDepartment}' AND Country = '${selectedCountry}' GROUP BY Region;`;
  const regionRows = runBigQuery(regionQuery);
  
  let rawRegional = { 'NOR': 0, 'SOU': 0, 'EAS': 0, 'WES': 0, 'HQ' : 0 };
  regionRows.forEach(row => {
    let safeRegion = String(row[0]).trim().toUpperCase();
    if (rawRegional[safeRegion] !== undefined) rawRegional[safeRegion] = (parseFloat(row[1]) || 0) / scaleFactor;
  });
  
  // Standardise the raw prefixes to the full strings expected by the front-end chart
  let regional = { 'NORTH': rawRegional['NOR'], 'SOUTH': rawRegional['SOU'], 'EAST': rawRegional['EAS'], 'WEST': rawRegional['WES'], 'HQ': rawRegional['HQ'] };
 
  return { department: selectedDepartment, country: selectedCountry, summary: summary, accounts: accounts, analysisDetails: analysisDetails, regional: regional };
} // <--- ADD THIS CLOSING BRACKET

function runBigQuery(sql) {
  const request = { query: sql, useLegacySql: false, useQueryCache: false,location: 'europe-west1' };
  let queryResults = BigQuery.Jobs.query(request, PROJECT_ID);
  let rows = queryResults.rows;
  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(PROJECT_ID, queryResults.jobReference.jobId, { pageToken: queryResults.pageToken });
    rows = rows.concat(queryResults.rows);
  }
  if (!rows) return [];
  return rows.map(r => r.f.map(c => c.v));
}

function formatDelta(num) {
  if(!num || num === 0) return "0.0";
  let formatted = Math.abs(num).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1});
  return num > 0 ? "+" + formatted : "-" + formatted;
}

function getCommentHistory(accountName, department, country) {
  try {
    const sheet = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    let history = [];
    for (let i = data.length - 1; i > 0; i--) {
      if (data[i][2] === country && data[i][3] === department && data[i][4] === accountName && data[i][6] !== "") {
        history.push({
          timestamp: String(data[i][0]),
          month: String(data[i][1]),
          user: String(data[i][5]),
          text: String(data[i][6])
        });
      }
    }
    return history;
  } catch(e) { return []; }
}

function saveComment(accountName, newComment, department, country) {
  try {
    const sheet = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheets()[0];
    const timestamp = new Date().toLocaleString();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonth = months[new Date().getMonth()];
    let user = "Dashboard User";
    try { user = Session.getActiveUser().getEmail() || user; } catch(e) {}
    sheet.appendRow([timestamp, currentMonth, country, department, accountName, user, newComment]);
    return "Success";
  } catch(e) { return "Saved"; }
}

function getInvoiceData(department, country, accountName) {
  let accountFilter = "";
  if (accountName && accountName !== 'All') {
    accountFilter = `AND Account_Name = '${accountName}'`;
  }
  const sql = `SELECT Financial_year, Month, Document_Date, Booking_date, Vendor, Document_number, Position_text, Amount, Cost_category, Document_type, Reference_document FROM \`cmd_dataset.WebApp_Invoice_Extract\` WHERE Department = '${department}' AND Country = '${country}' ${accountFilter}`;
  try { return runBigQuery(sql); } catch(e) { return []; }
}

function dummyDriveAuth() { DriveApp.getFiles(); }

function exportToSheet(dashboardData) {
  const dateStr = new Date().toISOString().split('T')[0];
  const ss = SpreadsheetApp.create(`${dashboardData.department} Department Dashboard - ${dateStr}`);
  try { const userEmail = Session.getActiveUser().getEmail(); if (userEmail) ss.addEditor(userEmail); } catch(e) {}
 
  const chartSheet = ss.insertSheet("Charts & Summary");
  const months = ['MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB'];
  chartSheet.appendRow(["Month", "CY", "Plan", "PY", "CE Target"]);
  for(let i=0; i<12; i++){
    chartSheet.appendRow([months[i], dashboardData.summary.cy[i], dashboardData.summary.plan[i], dashboardData.summary.py[i], dashboardData.summary.cePlan[i]]);
  }
 
  const trendChart = chartSheet.newChart().setChartType(Charts.ChartType.LINE).addRange(chartSheet.getRange("A1:D13")).setPosition(2, 7, 0, 0).setOption('title', `TOTAL ${dashboardData.department} Trend: CY vs Plan vs PY`).setOption('width', 600).setOption('height', 350).build();
  chartSheet.insertChart(trendChart);
  chartSheet.appendRow(["", "", "", "", ""]);
  chartSheet.appendRow(["Region", "YTD Actuals", "", "", ""]);
 
  let startRow = 16;
  let regions = Object.keys(dashboardData.regional);
  regions.forEach(reg => { chartSheet.appendRow([reg, dashboardData.regional[reg], "", "", ""]); });
 
  const regChart = chartSheet.newChart().setChartType(Charts.ChartType.COLUMN).addRange(chartSheet.getRange(`A${startRow}:B${startRow + regions.length}`)).setPosition(20, 7, 0, 0).setOption('title', 'Regional Comparison | YTD Actuals').setOption('colors', ['#3b73b9']).setOption('width', 400).setOption('height', 300).build();
  chartSheet.insertChart(regChart);
 
  const dataSheet = ss.getSheetByName("Sheet1");
  dataSheet.setName("Account Breakdown");
  dataSheet.appendRow(["Account Name", "Metric", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "YTD", "Delta YTD", "Delta Month", "Comment"]);
  dashboardData.accounts.forEach(acc => {
    dataSheet.appendRow([acc.name, "CY", ...acc.cy, acc.deltaYtd, acc.deltaMonth, acc.comment]);
    dataSheet.appendRow([acc.name, "Plan", ...acc.plan, "", "", ""]);
    dataSheet.appendRow([acc.name, "PY", ...acc.py, "", "", ""]);
  });
  dataSheet.getRange("A1:R1").setFontWeight("bold").setBackground("#20558a").setFontColor("white");
  dataSheet.setFrozenRows(1);
  dataSheet.autoResizeColumns(1, 18);
  return ss.getUrl();
}

function clearDepartmentComments(department, country, accountNames) {
  const sheet = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheets()[0];
  const timestamp = new Date().toLocaleString();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const currentMonth = months[new Date().getMonth()];
  let user = "System (New Month Reset)";
  try { user = Session.getActiveUser().getEmail() || user; } catch(e) {}
  let rowsToAppend = [];
  accountNames.forEach(acc => { rowsToAppend.push([timestamp, currentMonth, country, department, acc, user, ""]); });
  if(rowsToAppend.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
  return "Cleared";
}

function getAuditorDataV2(department, country, roundThreshold, selectedAccount, excludeCapex, selectedMonth) {
  if (!selectedAccount) selectedAccount = 'All';
  if (!selectedMonth) selectedMonth = 'All';
 
  let accountFilter = "";
  if (selectedAccount !== 'All') accountFilter = `AND Account_Name = '${selectedAccount}'`;
 
  let monthFilter = "";
  if (selectedMonth !== 'All') monthFilter = `AND SPLIT(CAST(Month AS STRING), '.')[OFFSET(0)] = '${selectedMonth}'`;
 
  let capexFilter = "";
  if (excludeCapex === true || excludeCapex === "true") {
    capexFilter = `AND LOWER(COALESCE(Vendor, '')) NOT LIKE '%capex%' AND LOWER(COALESCE(Vendor, '')) NOT LIKE '%accruals%' AND LOWER(COALESCE(Vendor, '')) NOT LIKE '%provisions%'`;
  }
 
  const sql = `WITH Invoice_Base AS (SELECT Month, Vendor, Document_number, Document_Date, Booking_date, Amount, Cost_category, Position_text, Reference_document FROM \`emagine-portfolio-cmd.cmd_dataset.WebApp_Invoice_Extract\` WHERE Department = '${department}' AND Country = '${country}' AND CAST(Financial_year AS STRING) LIKE '2026%' AND Document_type NOT IN ('KB', 'UB', 'AB', 'PB', 'ZZ', 'AT', 'AF', 'KZ', 'LX') AND Vendor IS NOT NULL AND Amount > 0 ${accountFilter} ${monthFilter} ${capexFilter} ), Flagged_Data AS (SELECT Month, Vendor, Document_number, Document_Date, Booking_date, Amount, Cost_category, Position_text, Reference_document, COUNT(*) OVER(PARTITION BY Month, Vendor) as Monthly_Vendor_Count, COUNT(*) OVER(PARTITION BY Month, Vendor, CAST(Amount AS STRING)) as Duplicate_Amount_Count FROM Invoice_Base) SELECT * FROM Flagged_Data WHERE Monthly_Vendor_Count > 2 OR Duplicate_Amount_Count > 1 OR MOD(CAST(Amount AS NUMERIC), CAST(${roundThreshold} AS NUMERIC)) = 0 ORDER BY Month DESC, Vendor ASC, Amount DESC;`;
  const request = { 
    query: sql, 
    useLegacySql: false, 
    useQueryCache: false, 
    location: 'europe-west1' // Added EU location specifically for the Auditor module
  };
  try {
    let queryResults = BigQuery.Jobs.query(request, PROJECT_ID);
    let rows = queryResults.rows || [];
    return rows.map(r => r.f.map(c => c.v));
  } catch(e) {
    return [["Error", e.message, "", "", "", "0", "", "", "0", "0", "0"]];
  }
}

function exportAuditorToSheet(dupData, roundData, department, country) {
  const dateStr = new Date().toISOString().split('T')[0];
  const ss = SpreadsheetApp.create(`Controlling Audit Export - ${department} (${country}) - ${dateStr}`);
  try { const userEmail = Session.getActiveUser().getEmail(); if (userEmail) ss.addEditor(userEmail); } catch(e) {}
 
  const dupSheet = ss.getSheets()[0];
  dupSheet.setName("Duplicate & Split Invoices");
  dupSheet.appendRow(["Period", "Vendor", "SAP Doc #", "Ref Doc", "Document Date", "Posting Date", "Amount", "Flag Reason"]);
  if (dupData && dupData.length > 0) dupSheet.getRange(2, 1, dupData.length, dupData[0].length).setValues(dupData);
  else dupSheet.appendRow(["No duplicate anomalies detected.", "", "", "", "", "", "", ""]);
  dupSheet.getRange("A1:H1").setFontWeight("bold").setBackground("#dc2626").setFontColor("white");
  dupSheet.setFrozenRows(1);
  dupSheet.autoResizeColumns(1, 8);
 
  const roundSheet = ss.insertSheet("Suspicious Round Numbers");
  roundSheet.appendRow(["Period", "Vendor", "SAP Doc #", "Ref Doc", "Document Date", "Posting Date", "Amount", "Position Text"]);
  if (roundData && roundData.length > 0) roundSheet.getRange(2, 1, roundData.length, roundData[0].length).setValues(roundData);
  else roundSheet.appendRow(["No round numbers detected.", "", "", "", "", "", "", ""]);
  roundSheet.getRange("A1:H1").setFontWeight("bold").setBackground("#f59e0b").setFontColor("white");
  roundSheet.setFrozenRows(1);
  roundSheet.autoResizeColumns(1, 8);
 
  return ss.getUrl();
}

function exportInvoicesToSheet(filteredInvoices, department, country, accountName) {
  const dateStr = new Date().toISOString().split('T')[0];
  const ss = SpreadsheetApp.create(`Invoice Export - ${department} (${country}) - ${accountName} - ${dateStr}`);
  try { const userEmail = Session.getActiveUser().getEmail(); if (userEmail) ss.addEditor(userEmail); } catch(e) {}
 
  const sheet = ss.getSheets()[0];
  sheet.setName("Filtered Invoices");
  sheet.appendRow(["FY", "Period", "Document Date", "Posting Date", "Vendor", "Document No", "Ref Doc", "Description (Position Text)", "Amount", "Cost Category", "Doc Type"]);
 
  if (filteredInvoices && filteredInvoices.length > 0) {
    sheet.getRange(2, 1, filteredInvoices.length, filteredInvoices[0].length).setValues(filteredInvoices);
  } else {
    sheet.appendRow(["No transactions matched the filters.", "", "", "", "", "", "", "", "", "", ""]);
  }
 
  sheet.getRange("A1:K1").setFontWeight("bold").setBackground("#20558a").setFontColor("white");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 11);
 
  return ss.getUrl();
}
