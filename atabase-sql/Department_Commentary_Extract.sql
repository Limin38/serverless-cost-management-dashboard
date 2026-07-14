create or replace view `emagine-portfolio-cmd.cmd_dataset.WebApp_Invoice_Extract` as 
WITH Combined_Invoices AS (
    SELECT * REPLACE(
        CAST(Cost_Centre_No AS STRING) AS Cost_Centre_No,
        CAST(Document_Date AS DATE) AS Document_Date,
        CAST(Booking_date AS DATE) AS Booking_date,
        CAST(Financial_year AS INT64) AS Financial_year,
        CAST(Posting_Period AS INT64) AS Posting_Period
    )
    FROM `emagine-portfolio-cmd.cmd_dataset.sap_invoice_data_cy`
    UNION ALL
    SELECT * REPLACE(
        CAST(Cost_Centre_No AS STRING) AS Cost_Centre_No,
        CAST(Document_Date AS DATE) AS Document_Date,
        CAST(Booking_date AS DATE) AS Booking_date,
        CAST(Financial_year AS INT64) AS Financial_year,
        CAST(Posting_Period AS INT64) AS Posting_Period
    )
    FROM `emagine-portfolio-cmd.cmd_dataset.sap_invoice_data_py`
),
Dim_Deduplicated AS (
    SELECT TRIM(LOWER(account_name)) AS Join_Key, MAX(department_account_responsibility) AS Department_Account_Responsibility
    FROM `emagine-portfolio-cmd.cmd_dataset.dim_account_owner_3` GROUP BY 1
),
Raw_Mapping AS (
    SELECT REGEXP_REPLACE(SPLIT(CAST(Int_Account_2_ AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z]', '') AS Join_Account_ID, REGEXP_REPLACE(SPLIT(CAST(Cost_category_ID AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z#]', '') AS Join_Cost_Cat_ID, COALESCE(NULLIF(TRIM(int_Account_2_Name), ''), NULLIF(TRIM(int_Account_Name), ''), NULLIF(TRIM(Cost_category_Name), '')) AS Clean_Account_Name, department_account_responsibility AS Department
    FROM `emagine-portfolio-cmd.cmd_dataset.dim_cost_category` WHERE Int_Account_2_ IS NOT NULL
    UNION ALL
    SELECT REGEXP_REPLACE(SPLIT(CAST(Int_Account_2 AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z]', '') AS Join_Account_ID, REGEXP_REPLACE(SPLIT(CAST(Cost_category_ID AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z#]', '') AS Join_Cost_Cat_ID, COALESCE(NULLIF(TRIM(int_Account_2_Name), ''), NULLIF(TRIM(int_Account_Name), ''), NULLIF(TRIM(Cost_category_Name), '')) AS Clean_Account_Name, department_account_responsibility AS Department
    FROM `emagine-portfolio-cmd.cmd_dataset.Cost_Category_hash` WHERE Int_Account_2 IS NOT NULL
),
Mapping_Exact AS ( SELECT Join_Account_ID, Join_Cost_Cat_ID, MAX(Clean_Account_Name) AS Clean_Account_Name, MAX(Department) AS Department FROM Raw_Mapping WHERE Join_Cost_Cat_ID NOT IN ('#', 'nan', '') AND Join_Cost_Cat_ID IS NOT NULL GROUP BY 1, 2 ),
Mapping_Fallback AS ( SELECT Join_Account_ID, MAX(Clean_Account_Name) AS Clean_Account_Name, MAX(Department) AS Department FROM Raw_Mapping WHERE Join_Cost_Cat_ID IN ('#', 'nan', '') OR Join_Cost_Cat_ID IS NULL GROUP BY 1 ),
Mapped_Invoices AS (
    SELECT
        i.Country,
        COALESCE(map_ex.Clean_Account_Name, map_fb.Clean_Account_Name, i.Int_Account_2_desc) AS Account_Name,  
        CONCAT(COALESCE(CAST(i.Cost_category AS STRING), 'N/A'), ' - ', COALESCE(i.Cost_category_desc, '')) AS Cost_category,
        i.Creditor_Debtor AS Vendor,
        i.Document_number,
        i.Reference_document,
        i.Position_text,
        i.Document_Date,
        i.Booking_date,
        i.Amount,
        SPLIT(CAST(i.Financial_year AS STRING), '.')[OFFSET(0)] AS Financial_year,  
        i.Posting_Period AS Month,
        i.Document_type,
        COALESCE(map_ex.Department, map_fb.Department, dim.Department_Account_Responsibility) AS Department
    FROM Combined_Invoices i
    LEFT JOIN Dim_Deduplicated dim ON TRIM(LOWER(REPLACE(REPLACE(i.Int_Account_2_desc, 'Booking Fees', 'Booking Fees'), 'Advertising Costs', 'Advertising Costs'))) = dim.Join_Key
    LEFT JOIN Mapping_Exact map_ex ON REGEXP_REPLACE(SPLIT(CAST(i.Int_Account_2 AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z]', '') = map_ex.Join_Account_ID AND REGEXP_REPLACE(SPLIT(CAST(i.Cost_category AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z#]', '') = map_ex.Join_Cost_Cat_ID
    LEFT JOIN Mapping_Fallback map_fb ON REGEXP_REPLACE(SPLIT(CAST(i.Int_Account_2 AS STRING), '.')[OFFSET(0)], r'[^0-9a-zA-Z]', '') = map_fb.Join_Account_ID
)
SELECT * FROM Mapped_Invoices WHERE Department IS NOT NULL
