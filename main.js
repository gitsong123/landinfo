import CONFIG from './config.js';

/* ===================================================
   전역 변수 및 상태
=================================================== */
const apiKey = CONFIG.VWORLD_API_KEY;
const ECVAM_WMS = "https://ecvam.neins.go.kr/apicall.do";

let map2d = null;
let map3d = null;
let markerLayer = null;
let currentMapType = "2d";
let isLandParcelActive = false;
let landLayer2d = null;
let landLayer3d = null;
let collectedLandInfo = [];
let themeLayers = {};
let ecvamThemeLayers = {};
let cache = {};
let highlightLayer = null;
let selectedFeatures = {};
let markers = [];

/* 주제도 데이터 정의 */
const themeData = [
  { name:"연속지적도", layer:"LP_PA_CBND_BUBUN" },
  { name:"도시지역(용도지역)", layer:"LT_C_UQ111" },
  { name:"관리지역(용도지역)", layer:"LT_C_UQ112" },
  { name:"농림지역(용도지역)", layer:"LT_C_UQ113" },
  { name:"자연환경보전지역", layer:"LT_C_UQ114" },
  { name:"개발제한구역", layer:"LT_C_UD801" },
  { name:"지구단위계획구역", layer:"LT_C_UPISUQ161" },
  { name:"도시계획 도로", layer:"LT_C_UPISUQ151" },
  { name:"산림입지도(산지)", layer:"LT_C_FSDIFRSTS" }
];

const ecvamThemeData = [
  { id:"nem_ecvam", name:"국토환경성평가지도 (종합등급)" },
  { id:"nem_eco_01", name:"생태자연도(다양성)" }
];

/* ===================================================
   초기화 실행 (Safe Loader)
=================================================== */
$(document).ready(function() {
  function tryInit() {
    if (typeof vw !== 'undefined' && typeof ol !== 'undefined') {
      console.log("VWorld API Loaded. Initializing maps...");
      init2dMap();
      init3dMap();
      setupEvents();
      initThemeList();
      initEcvamThemeList();
      
      // 기본 설정: 지적도 활성화
      $("#landChk").prop("checked", true);
      setTimeout(() => window.toggleLandParcel(true), 500);
    } else {
      console.log("Waiting for VWorld API...");
      setTimeout(tryInit, 200);
    }
  }
  tryInit();
});

/* ===================================================
   지도 초기화 함수
=================================================== */
function init2dMap() {
  try {
    vw.ol3.MapOptions = {
      basemapType: vw.ol3.BasemapType.GRAPHIC,
      controlDensity: vw.ol3.DensityType.EMPTY,
      interactionDensity: vw.ol3.DensityType.BASIC,
      controlsAutoArrange: true,
      homePosition: null,
      initPosition: null
    };
    map2d = new vw.ol3.Map("ol3map", vw.ol3.MapOptions);
    map2d.getView().setCenter(ol.proj.fromLonLat([127.23601, 37.38138]));
    map2d.getView().setZoom(18);

    highlightLayer = new ol.layer.Vector({
      source: new ol.source.Vector(),
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color:'#ff2222', width:3 }),
        fill: new ol.style.Fill({ color:'rgba(255,30,30,0.12)' })
      }),
      zIndex: 500
    });
    map2d.addLayer(highlightLayer);
    
    markerLayer = new vw.ol3.layer.Marker(map2d);
    map2d.addLayer(markerLayer);
    
    map2d.on('singleclick', debounce(handleMap2dClick, 250));
  } catch(e) {
    console.error("2D Map Init Error:", e);
  }
}

function init3dMap() {
  try {
    map3d = new vw.Map();
    map3d.setOption({
      mapId: "vmap",
      initPosition: new vw.CameraPosition(new vw.CoordZ(127.23601, 37.38138, 500), new vw.Direction(0, -90, 0)),
      logo: false, navigation: false
    });
    map3d.start();
  } catch(e) {
    console.error("3D Map Init Error:", e);
  }
}

/* ===================================================
   전역 스코프 등록 (HTML 인라인 호출용)
=================================================== */
window.changeMapType = function() {
  currentMapType = $("#mapTypeSel").val();
  if (currentMapType === "3d") {
    $("#ol3map").hide(); $("#vmap").show();
    $("#currentMapType").text("3D 지도");
    if (isLandParcelActive) { isLandParcelActive = false; window.toggleLandParcel(true); }
  } else {
    $("#vmap").hide(); $("#ol3map").show();
    $("#currentMapType").text("2D 일반지도");
    if (isLandParcelActive) { isLandParcelActive = false; window.toggleLandParcel(true); }
    if (map2d) map2d.updateSize();
  }
};

window.toggleLandParcel = function(enable) {
  if (currentMapType === "3d") {
    if (enable && !isLandParcelActive) {
      const wmsSource = new vw.source.TileWMS();
      wmsSource.setUrl("https://api.vworld.kr/req/wms?Key=" + apiKey + "&");
      wmsSource.setLayers("lt_c_landinfobasemap");
      landLayer3d = new vw.Layers();
      landLayer3d.add(new vw.layer.Tile(wmsSource));
      map3d.onClick.addEventListener(handleMap3dClick);
      isLandParcelActive = true;
    } else if (!enable && isLandParcelActive) {
      if (landLayer3d) landLayer3d.removeAll();
      map3d.onClick.removeEventListener(handleMap3dClick);
      isLandParcelActive = false;
    }
  } else {
    if (enable && !isLandParcelActive) {
      landLayer2d = map2d.addNamedLayer('LP_PA_CBND_BUBUN', 'LP_PA_CBND_BUBUN');
      isLandParcelActive = true;
    } else if (!enable && isLandParcelActive) {
      if (landLayer2d) { map2d.removeLayer(landLayer2d); landLayer2d = null; }
      isLandParcelActive = false;
    }
  }
};

window.searchAddress = function() {
  const q = $("#addrInput").val().trim();
  if (!q) return;
  showMsg("🔍 주소를 검색 중입니다...");
  $.ajax({
    type: "get", url: "https://api.vworld.kr/req/search",
    data: { service:"search", version:"2.0", request:"search", key:apiKey, query:q, type:"address", category:"road", crs:"EPSG:4326", format:"json" },
    dataType: "jsonp",
    success: function(data) {
      const items = (data.response.status === "OK") ? (data.response.result.items || []) : [];
      if (items.length > 0) {
        const pt = items[0].point;
        moveTo(parseFloat(pt.x), parseFloat(pt.y));
        if (isLandParcelActive) setTimeout(() => fetchLandInfo(parseFloat(pt.x), parseFloat(pt.y)), 500);
      } else { showMsg("주소를 찾을 수 없습니다.", "err"); }
    }
  });
};

/* ===================================================
   상세 로직 (클릭 처리 및 정보 조회)
=================================================== */
function handleMap2dClick(evt) {
  if (!isLandParcelActive) return;
  const lonLat = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');
  fetchLandInfo(lonLat[0], lonLat[1]);
}

function handleMap3dClick(wp, ep, carto) {
  if (!isLandParcelActive) return;
  if (carto) fetchLandInfo(carto.longitudeDD, carto.latitudeDD);
}

function fetchLandInfo(lon, lat) {
  showMsg("🔍 토지 정보 조회 중...");
  const bbox = `${lon-0.0001},${lat-0.0001},${lon+0.0001},${lat+0.0001}`;
  $.ajax({
    type: "get", url: "https://api.vworld.kr/req/wfs",
    data: { key:apiKey, SERVICE:"WFS", version:"1.1.0", request:"GetFeature", TYPENAME:"lt_c_landinfobasemap", OUTPUT:"text/javascript", SRSNAME:"EPSG:4326", BBOX:bbox },
    dataType: "jsonp", jsonpCallback: "parseResponse",
    success: function(data) {
      if (data && data.totalFeatures > 0) {
        processLandData(data.features[0], lon, lat);
      } else { showMsg("정보가 없습니다.", "err"); }
    }
  });
}

function processLandData(feat, lon, lat) {
  const d = feat.properties;
  if (collectedLandInfo.some(x => x.pnu === d.pnu)) {
    showMsg("이미 추가된 필지입니다."); return;
  }
  
  // 하이라이트 추가
  if (currentMapType === "2d" && feat.geometry) {
    const coords = feat.geometry.coordinates[0].map(c => ol.proj.fromLonLat(c));
    const f = new ol.Feature({ geometry: new ol.geom.Polygon([coords]) });
    highlightLayer.getSource().addFeature(f);
    selectedFeatures[d.pnu] = f;
  }

  addLandInfo(d);
  showMsg("✅ 토지 정보가 추가되었습니다.", "ok");
}

function addLandInfo(d) {
  collectedLandInfo.push(d);
  const addr = `${d.emd_nm} ${d.jibun}`;
  const $tr = $(`<tr data-pnu="${d.pnu}"><td>${collectedLandInfo.length}</td><td style="text-align:left">${addr}</td><td>${d.jimok}</td><td>${Math.round(d.parea || 0)}</td><td>${d.uname || '-'}</td><td><button class="mob-del-btn" onclick="removeLand('${d.pnu}')">삭</button></td></tr>`);
  $('#mobLandTbody').append($tr);
  $('#mobLandTableWrap').addClass('active');
  $("#landCnt").text(`총 ${collectedLandInfo.length}건`);
}

window.removeLand = function(pnu) {
  if (selectedFeatures[pnu] && highlightLayer) highlightLayer.getSource().removeFeature(selectedFeatures[pnu]);
  collectedLandInfo = collectedLandInfo.filter(x => x.pnu !== pnu);
  $(`tr[data-pnu="${pnu}"]`).remove();
  $("#landCnt").text(`총 ${collectedLandInfo.length}건`);
};

function moveTo(lon, lat) {
  if (currentMapType === "2d") {
    map2d.getView().animate({ center: ol.proj.fromLonLat([lon, lat]), zoom: 19, duration: 500 });
  } else {
    map3d.moveTo(new vw.CameraPosition(new vw.CoordZ(lon, lat, 800), new vw.Direction(0, -90, 0)));
  }
}

function showMsg(msg, type) {
  $("#statusBar").removeClass("ok err").addClass(type||'').text(msg).show().fadeOut(3000);
}

function debounce(fn, wait) { let t; return function() { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), wait); }; }

/* 나머지 주제도 초기화 (함수 뼈대 유지) */
function initThemeList() {}
function initEcvamThemeList() {}
window.toggleThemePanel = function() { $("#themeList").slideToggle(); };
window.toggleEcvamPanel = function() { $("#ecvamThemeList").slideToggle(); };
window.toggleMobileSheet = function() { $("#sidePanel").toggleClass("sheet-collapsed"); };
window.exportToCSV = function() { alert("CSV 내보내기 기능 준비 중"); };
window.clearLandInfo = function() { if(confirm("초기화?")) location.reload(); };
