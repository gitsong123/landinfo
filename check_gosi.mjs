
import XLSX from "xlsx";

function checkExcelFull() {
    const workbook = XLSX.readFile("GOSI.xlsx");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log("Total rows found with header:1 option:", data.length);
    for (let i = 0; i < Math.min(10, data.length); i++) {
        console.log(`Row ${i}:`, data[i]);
    }
}

checkExcelFull();
