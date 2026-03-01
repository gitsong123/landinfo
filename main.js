import CONFIG from './config.js';

/* ===================================================
   전역 변수 및 상태 (CONFIG 연동)
=================================================== */
const apiKey = CONFIG.VWORLD_API_KEY;
const ECVAM_WMS = "https://ecvam.neins.go.kr/apicall.do";

let map2d = null, map3d = null, markerLayer = null;
let currentMapType = "2d";
let isLandParcelActive = false;
let landLayer2d = null, landLayer3d = null;
let collectedLandInfo = [];
let cache = {};
let highlightLayer = null;
let selectedFeatures = {};
let markers = [];

/* 주제도 데이터 */
const themeData = [
  { name:"연속지적도", layer:"LP_PA_CBND_BUBUN" },
  { name:"도시지역(용도지역)", layer:"LT_C_UQ111" },
  { name:"지구단위계획구역", layer:"LT_C_UPISUQ161" }
];

/* ===================================================
   초기화 로더
=================================================== */
$(document).ready(function() {
  function tryInit() {
    if (typeof vw !== 'undefined' && typeof ol !== 'undefined') {
      init2dMap();
      init3dMap();
      setupEvents();
      
      $("#landChk").prop("checked", true);
      setTimeout(() => window.toggleLandParcel(true), 1000);
    } else {
      setTimeout(tryInit, 300);
    }
  }
  tryInit();
});

/* ===================================================
   지도 초기화
=================================================== */
function init2dMap() {
  map2d = new vw.ol3.Map("ol3map", {
    basemapType: vw.ol3.BasemapType.GRAPHIC,
    controlDensity: vw.ol3.DensityType.EMPTY,
    interactionDensity: vw.ol3.DensityType.BASIC,
    controlsAutoArrange: true
  });
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
}

function init3dMap() {
  map3d = new vw.Map();
  map3d.setOption({
    mapId: "vmap",
    initPosition: new vw.CameraPosition(new vw.CoordZ(127.23601, 37.38138, 500), new vw.Direction(0, -90, 0)),
    logo: false, navigation: false
  });
  map3d.start();
}

/* ===================================================
   전역 노출 함수 (HTML 인라인 호출용)
=================================================== */
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

window.changeMapType = function() {
  currentMapType = $("#mapTypeSel").val();
  if (currentMapType === "3d") {
    $("#ol3map").hide(); $("#vmap").show();
    $("#currentMapType").text("3D 지도");
    isLandParcelActive = false; window.toggleLandParcel(true);
  } else {
    $("#vmap").hide(); $("#ol3map").show();
    $("#currentMapType").text("2D 일반지도");
    isLandParcelActive = false; window.toggleLandParcel(true);
    if (map2d) map2d.updateSize();
  }
};

window.searchAddress = function() {
  const q = $("#addrInput").val().trim();
  if (!q) return;
  $.ajax({
    type: "get", url: "https://api.vworld.kr/req/search",
    data: { service:"search", version:"2.0", request:"search", key:apiKey, query:q, type:"address", category:"road", crs:"EPSG:4326", format:"json" },
    dataType: "jsonp",
    success: function(data) {
      if (data.response.status === "OK" && data.response.result.items.length > 0) {
        const pt = data.response.result.items[0].point;
        const lon = parseFloat(pt.x), lat = parseFloat(pt.y);
        moveTo(lon, lat);
        if (isLandParcelActive) setTimeout(() => fetchLandInfo(lon, lat), 500);
      } else { showMsg("주소를 찾을 수 없습니다.", "err"); }
    }
  });
};

/* ===================================================
   클릭 및 데이터 조회 로직
=================================================== */
function handleMap2dClick(evt) {
  if (!isLandParcelActive) return;
  const lonLat = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');
  fetchLandInfo(lonLat[0], lonLat[1]);
}

function handleMap3dClick(wp, ep, carto) {
  if (!isLandParcelActive && carto) return;
  fetchLandInfo(carto.longitudeDD, carto.latitudeDD);
}

function fetchLandInfo(lon, lat) {
  showMsg("🔍 토지 정보 조회 중...");
  const buf = 0.00015;
  const bbox = `${lon-buf},${lat-buf},${lon+buf},${lat+buf}`;
  
  $.ajax({
    type: "get",
    url: "https://api.vworld.kr/req/wfs",
    data: {
      key: apiKey, domain: CONFIG.DOMAIN,
      SERVICE: "WFS", version: "1.1.0", request: "GetFeature",
      TYPENAME: "lt_c_landinfobasemap,lt_c_uq111,lt_c_upisuq161",
      OUTPUT: "text/javascript", SRSNAME: "EPSG:4326", BBOX: bbox
    },
    dataType: "jsonp",
    jsonpCallback: "parseResponse",
    success: function(data) {
      if (data && data.totalFeatures > 0) {
        processLandData(data, lon, lat);
      } else {
        showMsg("해당 위치에 정보가 없습니다.", "err");
      }
    },
    error: function() { showMsg("조회 중 오류 발생", "err"); }
  });
}

function processLandData(data, lon, lat) {
  const baseFeats = data.features.filter(f => f.id.includes("lt_c_landinfobasemap"));
  if (baseFeats.length === 0) return;

  // PIP (Point In Polygon) 체크: 클릭 지점이 포함된 필지 찾기
  let best = baseFeats.find(f => isPointInPoly(lon, lat, f.geometry)) || baseFeats[0];
  const d = best.properties;

  if (collectedLandInfo.some(x => x.pnu === d.pnu)) {
    showMsg("이미 목록에 있는 필지입니다."); return;
  }

  // 2D 하이라이트
  if (currentMapType === "2d" && best.geometry) {
    const coords = best.geometry.type === 'MultiPolygon' ? best.geometry.coordinates[0][0] : best.geometry.coordinates[0];
    const poly = new ol.geom.Polygon([coords.map(c => ol.proj.fromLonLat(c))]);
    const f = new ol.Feature({ geometry: poly });
    highlightLayer.getSource().addFeature(f);
    selectedFeatures[d.pnu] = f;
  }

  addLandInfo(d);
  showMsg("✅ 토지 정보가 추가되었습니다.", "ok");
  
  // 가시영역 중앙 이동 (모바일 대응)
  moveTo(lon, lat, true);
}

function addLandInfo(d) {
  collectedLandInfo.push(d);
  const addr = `${d.emd_nm} ${d.jibun}`;
  const area = Math.round(d.parea || 0).toLocaleString();
  
  // 테이블 추가
  const $tr = $(`<tr data-pnu="${d.pnu}">
    <td>${collectedLandInfo.length}</td>
    <td style="text-align:left">${addr}</td>
    <td>${d.jimok}</td>
    <td>${area}</td>
    <td>${d.uname || '-'}</td>
    <td><button class="mob-del-btn" onclick="removeLand('${d.pnu}')">삭</button></td>
  </tr>`);
  $('#mobLandTbody').append($tr);
  $('#mobLandTableWrap').addClass('active');
  
  updateUI();
}

window.removeLand = function(pnu) {
  if (selectedFeatures[pnu]) highlightLayer.getSource().removeFeature(selectedFeatures[pnu]);
  collectedLandInfo = collectedLandInfo.filter(x => x.pnu !== pnu);
  $(`tr[data-pnu="${pnu}"]`).remove();
  updateUI();
};

function updateUI() {
  $("#landCnt").text(`총 ${collectedLandInfo.length}건`);
  const total = collectedLandInfo.reduce((s, x) => s + (parseFloat(x.parea) || 0), 0);
  if (collectedLandInfo.length > 0) {
    $("#areaSumVal").text(`${Math.round(total).toLocaleString()} ㎡`);
    $("#areaSumBar").show();
    $("#sheetPullLabel").text(`${collectedLandInfo.length}필지 · ${Math.round(total).toLocaleString()}㎡`);
  } else {
    $("#areaSumBar").hide();
    $("#sheetPullLabel").text("토지정보를 클릭하여 조회하세요");
  }
}

/* ===================================================
   유틸리티
=================================================== */
function isPointInPoly(x, y, geom) {
  const coords = geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : geom.coordinates[0];
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function moveTo(lon, lat, offset = false) {
  const center = ol.proj.fromLonLat([lon, lat]);
  let finalCenter = center;
  if (offset && window.innerWidth <= 768) {
    const res = map2d.getView().getResolution();
    finalCenter = [center[0], center[1] - (window.innerHeight * 0.25 * res)];
  }
  if (currentMapType === "2d") {
    map2d.getView().animate({ center: finalCenter, zoom: 19, duration: 500 });
  } else {
    map3d.moveTo(new vw.CameraPosition(new vw.CoordZ(lon, lat, 600), new vw.Direction(0, -90, 0)));
  }
}

function showMsg(msg, type) {
  $("#statusBar").removeClass("ok err").addClass(type||'').text(msg).stop(true,true).show().fadeOut(4000);
}

function debounce(fn, wait) {
  let t; return function() { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), wait); };
}

/* 나머지 윈도우 바인딩 */
window.toggleThemePanel = () => $("#themeList").slideToggle();
window.toggleEcvamPanel = () => $("#ecvamThemeList").slideToggle();
window.toggleMobileSheet = () => $("#sidePanel").toggleClass("sheet-collapsed");
window.clearLandInfo = () => { if(confirm("전체 삭제하시겠습니까?")) location.reload(); };
window.exportToCSV = () => alert("CSV 내보내기 기능은 준비 중입니다.");
