/**
 * 애플리케이션 환경 설정 및 API 키 관리
 */
const CONFIG = {
    VWORLD_API_KEY: "A12CEDAE-86F1-3453-BC92-3FD98BE14103",
    ECVAM_API_KEY: "MUTW-PGHX-76CT-ENMD",
    ADSENSE_CLIENT_ID: "ca-pub-4187457564577316",
    ADSENSE_SLOT_SIDEBAR: "YOUR_AD_SLOT_ID",
    DOMAIN: window.location.hostname || "localhost"
};

// 모듈 방식과 전역 방식 모두 지원
if (typeof window !== 'undefined') {
    window.APP_CONFIG = CONFIG;
}
export default CONFIG;
