
import XLSX from "xlsx";

const workbook = XLSX.readFile("GOSI.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
sheet['!ref'] = "A1:D500000"; 
const rows = XLSX.utils.sheet_to_json(sheet);

const sample = rows
    .filter(r => String(r['고시일']).startsWith('2025') || String(r['고시일']).startsWith('2026'))
    .slice(0, 20);

console.log(JSON.stringify(sample, null, 2));
