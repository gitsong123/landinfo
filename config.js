/**
 * 애플리케이션 환경 설정 및 API 키 관리
 * 보안 팁: V-World 및 ECVAM 키는 각 서비스 관리 페이지에서 사용 도메인(예: localhost, 서비스 도메인)을 반드시 제한하세요.
 */
const CONFIG = {
    VWORLD_API_KEY: "A12CEDAE-86F1-3453-BC92-3FD98BE14103",
    ECVAM_API_KEY: "MUTW-PGHX-76CT-ENMD",
    ADSENSE_CLIENT_ID: "ca-pub-4187457564577316",
    ADSENSE_SLOT_SIDEBAR: "YOUR_AD_SLOT_ID", // 실제 생성한 광고 슬롯 ID로 변경하세요.
    DOMAIN: window.location.hostname || "localhost"
};

export default CONFIG;
