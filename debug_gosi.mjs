
import XLSX from "xlsx";

function debugGosi() {
    console.log("Reading GOSI.xlsx...");
    const workbook = XLSX.readFile("GOSI.xlsx");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log("Total rows in file:", rows.length);
    if (rows.length > 0) {
        console.log("Header row:", rows[0]);
    }
    
    for (let i = 1; i < Math.min(20, rows.length); i++) {
        console.log(`Row ${i}:`, rows[i]);
    }
}

debugGosi();
