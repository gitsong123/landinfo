
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, Timestamp, writeBatch } from "firebase/firestore";
import XLSX from "xlsx";

const firebaseConfig = {
    apiKey: "AIzaSyD_oOfSE_XM9fWNlSmwM-4WXuPJtC8Yc0w",
    authDomain: "landinfo-a1539.firebaseapp.com",
    projectId: "landinfo-a1539",
    storageBucket: "landinfo-a1539.firebasestorage.app",
    messagingSenderId: "678702308952",
    appId: "1:678702308952:web:6113a3f2ac3b61322db42d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadGosi() {
    console.log("Reading GOSI.xlsx...");
    const workbook = XLSX.readFile("GOSI.xlsx");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    sheet['!ref'] = "A1:D500000"; 
    const rows = XLSX.utils.sheet_to_json(sheet);

    const now = new Date();
    const currentYear = now.getFullYear();

    // Filter and Validate
    const filtered = rows
        .filter(r => {
            const dateStr = String(r['고시일'] || "");
            if (!dateStr || dateStr.length < 10) return false;
            const year = parseInt(dateStr.substring(0, 4));
            // Only 2020 to currentYear + 1 (2026)
            return year >= 2020 && year <= 2026;
        })
        .sort((a, b) => String(b['고시일']).localeCompare(String(a['고시일'])));

    // Target 2000 most recent
    const target = filtered.slice(0, 2000);
    console.log(`Targeting ${target.length} valid notifications.`);

    const postsCol = collection(db, "posts");
    
    // Delete existing gosi
    console.log("Deleting existing gosi posts...");
    const q = query(postsCol, where("category", "==", "gosi"));
    const snapshot = await getDocs(q);
    
    let deleteBatch = writeBatch(db);
    let dCount = 0;
    for (const d of snapshot.docs) {
        deleteBatch.delete(d.ref);
        dCount++;
        if (dCount % 500 === 0) {
            await deleteBatch.commit();
            deleteBatch = writeBatch(db);
        }
    }
    await deleteBatch.commit();
    console.log(`Deleted ${dCount} old posts.`);

    // Upload
    const BATCH_SIZE = 100;
    for (let i = 0; i < target.length; i += BATCH_SIZE) {
        const chunk = target.slice(i, i + BATCH_SIZE);
        const promises = chunk.map(item => {
            const dateStr = String(item['고시일']);
            const gosiNo = String(item['고시번호'] || "");
            
            // Extract author from 고시번호 (e.g., "충청남도 천안시" from "충청남도 천안시고시 제...")
            let authorName = "시스템";
            if (gosiNo.includes("고시")) {
                authorName = gosiNo.split("고시")[0].trim();
            } else if (gosiNo.includes("공고")) {
                authorName = gosiNo.split("공고")[0].trim();
            }

            const title = String(item['고시명'] || '제목 없음').replace('[결정고시]', '').trim();
            const content = `고시번호: ${gosiNo || '-'}\n고시일: ${dateStr}\n\n**상세내용 및 링크**\n${item['접속URL'] || ''}`;
            
            // Precise date parsing to avoid timezone shifts
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d, 12, 0, 0); // Set to noon to avoid day shifts
            const createdAt = Timestamp.fromDate(dateObj);

            return addDoc(postsCol, {
                category: "gosi",
                title: title,
                content: content,
                authorId: "system",
                authorName: authorName,
                createdAt: createdAt
            });
        });
        
        await Promise.all(promises);
        console.log(`Uploaded ${Math.min(i + BATCH_SIZE, target.length)} / ${target.length}...`);
    }

    console.log("Upload complete!");
    process.exit(0);
}

uploadGosi().catch(err => {
    console.error(err);
    process.exit(1);
});
