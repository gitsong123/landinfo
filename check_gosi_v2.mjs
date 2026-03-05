
import XLSX from "xlsx";

function checkFullData() {
    console.log("Reading large GOSI.xlsx file (this might take a while)...");
    // Use more memory if needed, although 266MB XML usually fits in 1-2GB RAM.
    const workbook = XLSX.readFile("GOSI.xlsx", { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Manually check rows by encoding cells if sheet_to_json fails
    const range = XLSX.utils.decode_range(sheet['!ref']);
    console.log("Actual Range from sheet:", sheet['!ref']);
    
    // If range is A1:D1, but file is huge, maybe !ref is wrong.
    // Excel files sometimes have incorrect !ref.
    // Let's try to find the last row by checking cells.
    let lastRow = range.e.r;
    if (lastRow === 0) {
        // Try scanning up to 100,000 rows just in case
        for (let r = 1; r < 100000; r++) {
            if (sheet[XLSX.utils.encode_cell({r, c:0})]) {
                lastRow = r;
            } else if (r > 100 && !sheet[XLSX.utils.encode_cell({r: r-1, c:0})]) {
                // stop after some empty rows
                // break; 
            }
        }
    }
    console.log("Scanned last row index:", lastRow);

    const data = XLSX.utils.sheet_to_json(sheet);
    console.log("Total rows found via sheet_to_json:", data.length);
    if (data.length > 0) {
        console.log("Sample row:", data[0]);
    }
}

checkFullData();
