import CONFIG from './config.js';

/* ===================================================
   전역 변수 (CONFIG 연동)
=================================================== */
const apiKey = CONFIG.VWORLD_API_KEY;
const ecvamApiKey = CONFIG.ECVAM_API_KEY;
const ECVAM_WMS = "https://ecvam.neins.go.kr/apicall.do";

let map2d, map3d, markerLayer;
let currentMapType = "2d";
let isLandParcelActive = false;
let landLayer2d = null, landLayer3d = null;
let map3dClickAdded = false;
let collectedLandInfo = [];
let markers = [];
let themeLayers = {};
let ecvamThemeLayers = {};
let cache = {};
let highlightLayer = null;
let highlight3dEntities = {};
let selectedFeatures = {};

const themeData = [
  { name:"연속지적도",        layer:"LP_PA_CBND_BUBUN",    lf:"jibun" },
  { name:"도시지역(용도지역)", layer:"LT_C_UQ111",          lf:"uname" },
  { name:"관리지역(용도지역)", layer:"LT_C_UQ112",          lf:"uname" },
  { name:"농림지역(용도지역)", layer:"LT_C_UQ113",          lf:"uname" },
  { name:"자연환경보전지역",   layer:"LT_C_UQ114",          lf:"uname" },
  { name:"개발제한구역",       layer:"LT_C_UD801",          lf:"" },
  { name:"지구단위계획구역",   layer:"LT_C_UPISUQ161",      lf:"dgm_nm" },
  { name:"도시계획 도로",      layer:"LT_C_UPISUQ151",      lf:"" },
  { name:"도시계획 공간시설",  layer:"LT_C_UPISUQ153",      lf:"" },
  { name:"도시계획 유통공급",  layer:"LT_C_UPISUQ154",      lf:"" },
  { name:"공공문화체육시설",   layer:"LT_C_UPISUQ155",      lf:"" },
  { name:"도시계획 방재시설",  layer:"LT_C_UPISUQ156",      lf:"" },
  { name:"도시계획 보건위생",  layer:"LT_C_UPISUQ157",      lf:"" },
  { name:"도시계획 환경위생",  layer:"LT_C_UPISUQ158",      lf:"" },
  { name:"도시계획 기타기반",  layer:"LT_C_UPISUQ159",      lf:"" },
  { name:"상수원보호구역",     layer:"LT_C_UM710",          lf:"uname" },
  { name:"건축물 정보",        layer:"LT_C_BLDGINFO",       lf:"" },
  { name:"초등학교통학구역",   layer:"LT_C_DESCH",          lf:"hakgudo_nm" },
  { name:"산림입지도(산지)",   layer:"LT_C_FSDIFRSTS",      lf:"name" }
];

const ecvamThemeData = [
  { id:"nem_ecvam",    name:"국토환경성평가지도 (종합등급)" },
  { id:"nem_eco",      name:"환경·생태적 평가결과" },
  { id:"nem_eco_01",   name:"생태자연도(다양성)" },
  { id:"nem_eco_02",   name:"자연성 평가" },
  { id:"nem_eco_04",   name:"희귀성 평가" },
  { id:"nem_law",      name:"법제적 평가결과 (종합)" },
  { id:"nem_law_01",   name:"생태·경관보전지역" },
  { id:"nem_law_28",   name:"자연환경보전지역" },
  { id:"nem_law_22",   name:"상수원보호구역" },
  { id:"nem_law_35",   name:"개발제한구역" }
];

/* ===================================================
   초기화
=================================================== */
$(document).ready(function() {
  init2dMap();
  init3dMap();
  setupEvents();
  initThemeList();
  initEcvamThemeList();

  $("#vmap").hide();
  $("#ol3map").show();

  activateLandParcel();

  function activateLandParcel() {
    $("#landChk").prop("checked", true);
    window.toggleLandParcel(true);
    try { map2d.updateSize(); } catch(e){}
  }

  $(window).on('resize', function(){
    if (currentMapType === "2d") try{ map2d.updateSize(); }catch(e){}
  });
});

/* ===================================================
   전역 스코프 등록 (HTML 인라인 호출용)
=================================================== */
window.changeMapType = function() {
  currentMapType = $("#mapTypeSel").val();

  if (currentMapType === "3d") {
    var lon2d, lat2d, zoom2d;
    try {
      var c = ol.proj.toLonLat(map2d.getView().getCenter());
      lon2d = c[0]; lat2d = c[1];
      zoom2d = map2d.getView().getZoom() || 18;
    } catch(e){}

    $("#ol3map").hide(); $("#vmap").show();
    $("#currentMapType").text("3D 지도");
    if (isLandParcelActive) { isLandParcelActive = false; toggle3dLayer(true); }

    if (lon2d && lat2d) {
      var alt = Math.max(200, Math.pow(2, 20 - zoom2d) * 250);
      setTimeout(function(){
        try {
          map3d.moveTo(new vw.CameraPosition(
            new vw.CoordZ(lon2d, lat2d, alt),
            new vw.Direction(0, -90, 0)
          ));
        } catch(e){}
      }, 300);
    }
    try{ map3d.refresh(); }catch(e){}

  } else {
    var lon3d, lat3d, z3d;
    try {
      var pos = map3d.getCurrentPosition().position;
      lon3d = pos.lon || pos.x || pos[0];
      lat3d = pos.lat || pos.y || pos[1];
      z3d = pos.z || pos.alt || pos[2];
    } catch(e){}

    $("#vmap").hide(); $("#ol3map").show();
    $("#currentMapType").text("2D 일반지도");
    if (isLandParcelActive) { isLandParcelActive = false; toggle2dLayer(true); }

    if (lon3d && lat3d) {
      var zoom2dNew = z3d ? Math.max(14, Math.min(20, Math.round(20 - Math.log2(z3d / 150)))) : 18;
      try {
        map2d.getView().setCenter(ol.proj.fromLonLat([lon3d, lat3d]));
        map2d.getView().setZoom(zoom2dNew);
      } catch(e){}
    }
    try{ map2d.updateSize(); }catch(e){}
  }
};

window.searchAddress = function() {
  var q = $("#addrInput").val().trim();
  if (!q) { showMsg("검색어를 입력하세요.", "err"); return; }
  closeAddrResults();
  var qNormalized = q.replace(/산(\d+)/g, "산 $1");
  showMsg("🔍 주소를 검색 중입니다...");
  if (qNormalized.indexOf("산") > -1) {
    doSearch(qNormalized, "parcel", function(found) {
      if (!found) doSearch(qNormalized, "road");
    });
  } else {
    doSearch(qNormalized, "road", function(found) {
      if (!found) doSearch(qNormalized, "parcel");
    });
  }
};

window.toggleLandParcel = function(enable) {
  if (currentMapType === "3d") toggle3dLayer(enable);
  else toggle2dLayer(enable);
};

window.toggleThemePanel = function() {
  var $list = $("#themeList");
  var $btn = $(".theme-panel:first .toggle-btn");
  if ($list.is(":visible")) { $list.slideUp(); $btn.text("펼치기"); }
  else { $list.slideDown(); $btn.text("접기"); }
};

window.toggleEcvamPanel = function() {
  var $list = $("#ecvamThemeList");
  var $btn = $("#ecvamToggleBtn");
  if ($list.is(":visible")) { $list.slideUp(); $btn.text("펼치기"); }
  else { $list.slideDown(); $btn.text("접기"); }
};

window.toggleMobileSheet = function() {
  var $side = $("#sidePanel");
  var $toggle = $("#sheetPullToggle");
  if ($side.hasClass("sheet-collapsed")) {
    $side.removeClass("sheet-collapsed");
    $toggle.text("▼");
  } else {
    $side.addClass("sheet-collapsed");
    $toggle.text("▲");
  }
};

window.exportToCSV = function() {
  if (!collectedLandInfo.length) { showMsg("내보낼 데이터가 없습니다.", "err"); return; }
  var fmt = function(v){ return (v && !isNaN(v)) ? Number(v).toLocaleString() : (v||''); };
  var csv = "\uFEFF순번,필지번호(PNU),시도,시군구,읍면동,리,지번,지목,면적(㎡),공시지가(원/㎡),용도지역,지구단위계획구역,국토환경성평가등급,생태자연도등급\n";
  var totalArea = 0;
  collectedLandInfo.forEach(function(d, idx) {
    var area = parseFloat(d.area_ || d.parea || 0);
    if (!isNaN(area)) totalArea += area;
    csv += [
      idx + 1,
      '="' + (d.pnu||'') + '"',
      d.sido_nm||'', d.sgg_nm||'', d.emd_nm||'', d.ri_nm||'',
      d.jibun||'', d.jimok||'',
      fmt(d.area_||d.parea),
      fmt(d.jiga),
      d.uname||'', d.dgm_nm||'',
      d.ecvam_gr||'', d.bio_gr||''
    ].map(function(f){ return '"' + String(f).replace(/"/g,'""') + '"'; }).join(',') + '\n';
  });
  csv += '"합계","","","","","","","","' + Math.round(totalArea).toLocaleString() + '","","","","",""\n';
  var blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '토지조서_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showMsg("✅ CSV 파일(" + collectedLandInfo.length + "건)을 다운로드했습니다.", "ok");
};

window.clearLandInfo = function() {
  if (!collectedLandInfo.length) return;
  if (!confirm("수집된 모든 토지 정보를 삭제하시겠습니까?")) return;
  clearHighlight();
  collectedLandInfo = [];
  markers.forEach(function(m){ try{ markerLayer.removeMarker(m.marker); }catch(e){} });
  markers = [];
  $("#landList .land-item").remove();
  $("#mobLandTbody").empty();
  $("#mobLandTableWrap").removeClass('active');
  showEmptyState();
  updateCnt();
  showMsg("모든 토지 정보를 삭제했습니다.");
};

window.openInNewWindow = function(pnu) {
  var d = collectedLandInfo.find(function(x){ return x.pnu === pnu; });
  if (!d) return;
  var addr = [d.sido_nm, d.sgg_nm, d.emd_nm, d.ri_nm, d.jibun].filter(Boolean).join(' ');
  var fmt = function(v){ return (v && v !== '-' && !isNaN(v)) ? Number(v).toLocaleString() : (v || '-'); };

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + addr + ' - 토지정보</title>' +
    '<style>' +
    'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;margin:0;padding:16px;background:#f4f6fb;font-size:13px;}' +
    'h2{color:#3a7bd5;margin:0 0 12px;font-size:15px;font-weight:700;}' +
    '.card{background:#fff;border-radius:10px;padding:0;box-shadow:0 2px 12px rgba(0,0,0,.1);overflow:hidden;margin-bottom:12px;}' +
    'table{width:100%;border-collapse:collapse;}' +
    'tr{border-bottom:1px solid #f0f3fb;}' +
    'tr:last-child{border-bottom:none;}' +
    'td{padding:8px 12px;font-size:13px;}' +
    'td:first-child{color:#555;font-weight:600;width:42%;background:#fafbff;}' +
    'td:last-child{color:#222;}' +
    '.sec{background:#f0f4ff;padding:8px 12px;font-weight:700;color:#3a7bd5;font-size:11px;letter-spacing:.5px;}' +
    '.footer{font-size:10px;color:#aaa;text-align:center;margin-top:8px;}' +
    '</style></head><body>' +
    '<h2>📌 ' + addr + '</h2>' +
    '<div class="card"><table>' +
    '<tr><td class="sec" colspan="2">📌 기본 지적 정보</td></tr>' +
    '<tr><td>필지번호(PNU)</td><td>' + (d.pnu||'-') + '</td></tr>' +
    '<tr><td>지번</td><td>' + (d.jibun||'-') + '</td></tr>' +
    '<tr><td>지목</td><td>' + (d.jimok||'-') + '</td></tr>' +
    '<tr><td>면적(㎡)</td><td>' + fmt(d.area_||d.parea) + '</td></tr>' +
    '<tr><td class="sec" colspan="2">💰 공시 정보</td></tr>' +
    '<tr><td>공시지가(원/㎡)</td><td>' + fmt(d.jiga) + '</td></tr>' +
    '<tr><td class="sec" colspan="2">🏗 용도계획정보</td></tr>' +
    '<tr><td>용도지역</td><td>' + (d.uname||'-') + '</td></tr>' +
    '<tr><td>지구단위계획구역</td><td>' + (d.dgm_nm||'-') + '</td></tr>' +
    '<tr><td class="sec" colspan="2">🌿 환경성평가 정보</td></tr>' +
    '<tr><td>국토환경성평가등급</td><td>' + (d.ecvam_gr && d.ecvam_gr !== '-' ? d.ecvam_gr + '등급' : '지도에서 확인') + '</td></tr>' +
    '<tr><td>생태자연도등급</td><td>' + (d.bio_gr && d.bio_gr !== '-' ? d.bio_gr + '등급' : '지도에서 확인') + '</td></tr>' +
    '<tr><td colspan="2" style="text-align:center;padding:6px;"><a href="https://ecvam.neins.go.kr" target="_blank" style="color:#339966;font-size:11px;font-weight:600;">🌿 국토환경성평가지도 바로가기 →</a></td></tr>' +
    '</table></div>' +
    '<p class="footer">© 2026 UrbanCNS · Powered by VWorld API · ' + new Date().toLocaleDateString('ko-KR') + '</p>' +
    '</body></html>';

  var win = window.open('', '_blank', 'width=480,height=660,menubar=no,toolbar=no,location=no,status=no');
  if (win) { win.document.write(html); win.document.close(); }
  else { showMsg("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.", "err"); }
};

/* ===================================================
   내부 로직 함수들
=================================================== */
function init2dMap() {
  vw.ol3.MapOptions = {
    basemapType: vw.ol3.BasemapType.GRAPHIC,
    controlDensity: vw.ol3.DensityType.EMPTY,
    interactionDensity: vw.ol3.DensityType.BASIC,
    controlsAutoArrange: true,
    homePosition: vw.ol3.CameraPosition,
    initPosition: vw.ol3.CameraPosition
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
  markerLayer = new vw.ol3.layer.Marker(map2d, { showTitle:true });
  map2d.addLayer(markerLayer);
  map2d.on('singleclick', debounce(handleMap2dClick, 250));
}

function init3dMap() {
  var opts = {
    mapId: "vmap",
    initPosition: new vw.CameraPosition(
      new vw.CoordZ(127.23601, 37.38138, 500),
      new vw.Direction(0, -90, 0)
    ),
    logo: false, navigation: false
  };
  map3d = new vw.Map();
  map3d.setOption(opts);
  map3d.setMapId("vmap");
  map3d.setInitPosition(opts.initPosition);
  map3d.setLogoVisible(false);
  map3d.setNavigationZoomVisible(true);
  map3d.start();
}

function toggle2dLayer(enable) {
  if (enable && !isLandParcelActive) {
    try {
      landLayer2d = map2d.addNamedLayer('LP_PA_CBND_BUBUN', 'LP_PA_CBND_BUBUN');
      map2d.addLayer(landLayer2d);
      isLandParcelActive = true;
      showMsg("2D 지적도가 활성화되었습니다.", "ok");
    } catch(e){ showMsg("지적도 활성화 오류: " + e.message, "err"); }
  } else if (!enable && isLandParcelActive) {
    try {
      if (landLayer2d) { landLayer2d.setVisible(false); map2d.removeLayer(landLayer2d); landLayer2d = null; }
      isLandParcelActive = false;
      showMsg("지적도가 비활성화되었습니다.");
    } catch(e){}
  }
}

function toggle3dLayer(enable) {
  if (enable && !isLandParcelActive) {
    try {
      var wmsSource = new vw.source.TileWMS();
      wmsSource.setUrl("https://api.vworld.kr/req/wms?Key=" + apiKey + "&");
      wmsSource.setLayers("lt_c_landinfobasemap");
      wmsSource.setParams("tilesize=256");
      var wmsTile = new vw.layer.Tile(wmsSource);
      landLayer3d = new vw.Layers();
      landLayer3d.add(wmsTile);
      if (!map3dClickAdded) {
        map3d.onClick.addEventListener(handleMap3dClick);
        map3dClickAdded = true;
      }
      isLandParcelActive = true;
      showMsg("3D 지적도가 활성화되었습니다.", "ok");
    } catch(e){ showMsg("3D 지적도 오류: " + e.message, "err"); }
  } else if (!enable && isLandParcelActive) {
    try {
      if (landLayer3d) { landLayer3d.removeAll(); landLayer3d = null; }
      try { map3d.onClick.removeEventListener(handleMap3dClick); } catch(e2){}
      map3dClickAdded = false;
      isLandParcelActive = false;
      showMsg("지적도가 비활성화되었습니다.");
    } catch(e){}
  }
}

function initThemeList() {
  var $list = $("#themeList");
  themeData.forEach(function(t) {
    var $item = $('<div class="theme-item" data-layer="' + t.layer + '">' +
      '<span class="drag-handle">☰</span>' +
      '<input type="checkbox" id="tc_' + t.layer + '" data-layer="' + t.layer + '">' +
      '<label for="tc_' + t.layer + '">' + t.name + '</label>' +
      '</div>');
    $list.append($item);
    $item.find('input').on('change', function(){ toggleThemeLayer(t.layer, this.checked, t); });
  });
  try {
    $list.sortable({ handle:'.drag-handle', update: updateLayerOrder });
    $list.disableSelection();
  } catch(e){}
}

function toggleThemeLayer(layerName, enable, theme) {
  if (currentMapType !== "2d") {
    showMsg("주제도는 2D 지도에서만 지원합니다.", "err");
    $("#tc_" + layerName).prop("checked", false);
    return;
  }
  if (enable) {
    if (!themeLayers[layerName]) {
      try {
        themeLayers[layerName] = map2d.addNamedLayer(layerName, layerName);
        map2d.addLayer(themeLayers[layerName]);
      } catch(e){ showMsg("레이어 추가 오류: " + e.message, "err"); return; }
    }
    themeLayers[layerName].setVisible(true);
    showMsg(theme.name + " 주제도 활성화됨.", "ok");
    updateLayerOrder();
  } else {
    if (themeLayers[layerName]) {
      themeLayers[layerName].setVisible(false);
      showMsg(theme.name + " 주제도 비활성화됨.");
    }
  }
}

function updateLayerOrder() {
  if (currentMapType !== "2d") return;
  $("#themeList .theme-item").each(function(i) {
    var ln = $(this).data("layer");
    if (themeLayers[ln]) try{ themeLayers[ln].setZIndex(100 - i); }catch(e){}
  });
}

function initEcvamThemeList() {
  var $list = $("#ecvamThemeList");
  ecvamThemeData.forEach(function(t) {
    var $item = $('<div class="theme-item" data-ecvam="' + t.id + '">' +
      '<span class="drag-handle">☰</span>' +
      '<input type="checkbox" id="etc_' + t.id + '" data-ecvam="' + t.id + '">' +
      '<label for="etc_' + t.id + '">' + t.name + '</label>' +
      '</div>');
    $list.append($item);
    $item.find('input').on('change', function(){ toggleEcvamLayer(t.id, t.name, this.checked); });
  });
}

function toggleEcvamLayer(layerId, layerName, enable) {
  if (currentMapType !== "2d") {
    showMsg("환경성평가 주제도는 2D 지도에서만 지원합니다.", "err");
    $("#etc_" + layerId).prop("checked", false);
    return;
  }
  if (typeof ecvamLayerCreate === 'undefined') {
    showMsg("ECVAM API 로드 실패. 인터넷 연결 후 새로고침하세요.", "err");
    $("#etc_" + layerId).prop("checked", false);
    return;
  }
  if (enable) {
    if (!ecvamThemeLayers[layerId]) {
      try {
        var layer = ecvamLayerCreate(layerId, true);
        layer.setZIndex(200);
        map2d.addLayer(layer);
        ecvamThemeLayers[layerId] = layer;
      } catch(e) { showMsg("레이어 추가 오류: " + e.message, "err"); return; }
    } else {
      ecvamThemeLayers[layerId].setVisible(true);
    }
    showMsg("🌿 " + layerName + " 레이어 활성화됨.", "ok");
  } else {
    if (ecvamThemeLayers[layerId]) {
      ecvamThemeLayers[layerId].setVisible(false);
      showMsg(layerName + " 레이어 비활성화됨.");
    }
  }
}

function fetchEcvamGrade(lon, lat, callback) {
  var delta = 0.0002;
  var bbox = (lon - delta) + ',' + (lat - delta) + ',' + (lon + delta) + ',' + (lat + delta);
  var baseParams = '&SERVICE=WMS&VERSION=1.1.0&REQUEST=GetFeatureInfo' +
    '&STYLES=&SRS=EPSG:4326&BBOX=' + bbox +
    '&WIDTH=10&HEIGHT=10&X=5&Y=5&FEATURE_COUNT=1';
  var result = { ecvam_gr: '-', bio_gr: '-' };
  var done = 0;
  function checkDone() { if (++done >= 2) callback(result); }
  function tryGfi(layerId, field, onDone) {
    $.ajax({
      url: ECVAM_WMS + '?LAYERS=' + layerId + '&QUERY_LAYERS=' + layerId +
           '&INFO_FORMAT=application/json' + baseParams,
      timeout: 4000,
      success: function(data) {
        try {
          var feats = (data && data.features) || [];
          if (feats.length > 0) {
            var p = feats[0].properties || {};
            var v = p.grade || p.GRADE || p.pvalue || p.value || p.ecvam_gr ||
                    p.score || p.SCORE || p.bio_gr || null;
            if (v !== null && v !== undefined) onDone(String(v));
            else onDone('-');
          } else { onDone('-'); }
        } catch(e) { onDone('-'); }
      },
      error: function() { onDone('-'); }
    });
  }
  tryGfi('nem_ecvam', 'grade', function(v) { result.ecvam_gr = v; checkDone(); });
  tryGfi('nem_eco_01', 'grade', function(v) { result.bio_gr = v; checkDone(); });
}

function ecvamGrBadge(gr) {
  if (!gr || gr === '-' || gr === 'null') return '<span style="color:#aaa;font-size:11px;">-</span>';
  var cls = 'ecvam-gr' + gr;
  return '<span class="ecvam-badge ' + cls + '">' + gr + '등급</span>';
}

function updateEcvamGradeOnCard(pnu, ecvamResult) {
  var $card = $('.land-item[data-pnu="' + pnu + '"]');
  if (!$card.length) return;
  $card.find('.ecvam-val-ecvam').html(ecvamGrBadge(ecvamResult.ecvam_gr));
  $card.find('.ecvam-val-bio').html(ecvamGrBadge(ecvamResult.bio_gr));
  var d = collectedLandInfo.find(function(x){ return x.pnu === pnu; });
  if (d) { d.ecvam_gr = ecvamResult.ecvam_gr; d.bio_gr = ecvamResult.bio_gr; }
}

function handleMap2dClick(evt) {
  if (!isLandParcelActive) return;
  var coordinate = evt.coordinate;
  var lonLat = ol.proj.transform(coordinate, 'EPSG:3857', 'EPSG:4326');
  var lon = lonLat[0], lat = lonLat[1];
  var view = map2d.getView();
  var viewResolution = view.getResolution();
  var source = landLayer2d.getSource();
  var url = source.getFeatureInfoUrl(coordinate, viewResolution, view.getProjection(), { 'INFO_FORMAT': 'application/json', 'FEATURE_COUNT': 10 });
  if (url) {
    showMsg("🔍 토지 정보 조회 중...");
    fetch(url).then(r => r.json()).then(data => {
      if (data.features && data.features.length > 0) processLandData(data, lon, lat);
      else showMsg("선택 위치에 토지 정보가 없습니다.", "err");
    }).catch(e => { showMsg("조회 중 오류가 발생했습니다.", "err"); });
  }
}

function handleMap3dClick(wp, ep, carto) {
  if (!isLandParcelActive) return;
  if (carto && carto.longitudeDD && carto.latitudeDD) fetchLandInfo(carto.longitudeDD, carto.latitudeDD);
}

function fetchLandInfo(lon, lat) {
  if (!isLandParcelActive) return;
  var buf = getBuf(lon, lat);
  var bbox = (lon-buf[0])+","+(lat-buf[1])+","+(lon+buf[0])+","+(lat+buf[1]);
  var ck = "land_" + lon.toFixed(7) + "_" + lat.toFixed(7);
  if (cache[ck]) { processLandData(cache[ck], lon, lat); showMsg("캐시에서 불러왔습니다."); return; }
  showMsg("🔍 토지 정보 조회 중...");
  $.ajax({
    type: "get",
    url: "https://api.vworld.kr/req/wfs",
    data: {
      key: apiKey, domain: window.location.hostname || "localhost",
      SERVICE: "WFS", version: "1.1.0", request: "GetFeature",
      TYPENAME: ["lt_c_landinfobasemap","lt_c_uq111","lt_c_uq112","lt_c_uq113","lt_c_uq114","lt_c_upisuq161","lp_pa_cbnd_bubun"].join(","),
      OUTPUT: "text/javascript", SRSNAME: "EPSG:4326", BBOX: bbox
    },
    dataType: "jsonp", jsonpCallback: "parseResponse",
    success: function(data) {
      if (data && data.totalFeatures > 0) { cache[ck] = data; processLandData(data, lon, lat); }
      else showMsg("선택 위치에 토지 정보가 없습니다.", "err");
    },
    error: function() { showMsg("조회 중 오류가 발생했습니다.", "err"); }
  });
}

function addHighlight2d(geometry, pnu) {
  if (!highlightLayer) return;
  try {
    var type = geometry.type, olGeom;
    if (type === 'Polygon') {
      var rings = geometry.coordinates.map(r => r.map(c => ol.proj.fromLonLat([c[0],c[1]])));
      olGeom = new ol.geom.Polygon(rings);
    } else if (type === 'MultiPolygon') {
      var polys = geometry.coordinates.map(p => p.map(r => r.map(c => ol.proj.fromLonLat([c[0],c[1]]))));
      olGeom = new ol.geom.MultiPolygon(polys);
    }
    if (olGeom) {
      var f = new ol.Feature({ geometry: olGeom, pnu: pnu });
      highlightLayer.getSource().addFeature(f);
      selectedFeatures[pnu] = f;
    }
  } catch(e){}
}

function removeHighlight2d(pnu) {
  var f = selectedFeatures[pnu];
  if (f && highlightLayer) { try{ highlightLayer.getSource().removeFeature(f); }catch(e){} delete selectedFeatures[pnu]; }
}

function findCesiumViewer() {
  if (!window.Cesium) return null;
  var tries = [map3d._viewer, map3d.viewer, map3d.getCesiumViewer && map3d.getCesiumViewer()];
  for (var i = 0; i < tries.length; i++) if (tries[i] && tries[i].entities) return tries[i];
  var vmapEl = document.getElementById('vmap');
  if (vmapEl) for (var k in vmapEl) try { var v = vmapEl[k]; if (v && v.entities && typeof v.entities.add === 'function') return v; } catch(e){}
  return null;
}

function addHighlight3d(geometry, pnu) {
  function doHighlight(ret) {
    try {
      var v = findCesiumViewer();
      if (!v) { if (ret > 0) setTimeout(() => doHighlight(ret - 1), 600); return; }
      var coords = geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : geometry.coordinates[0];
      var pos = coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));
      var poly = v.entities.add({ polygon: { hierarchy: new Cesium.PolygonHierarchy(pos), material: Cesium.Color.RED.withAlpha(0.3), classificationType: typeof Cesium.ClassificationType !== 'undefined' ? Cesium.ClassificationType.BOTH : undefined } });
      var line = v.entities.add({ polyline: { positions: pos.concat([pos[0]]), width: 3, material: new Cesium.PolylineOutlineMaterialProperty({ color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 1 }), clampToGround: true } });
      highlight3dEntities[pnu] = { poly: poly, line: line };
    } catch(e){ if (ret > 0) setTimeout(() => doHighlight(ret - 1), 600); }
  }
  doHighlight(5);
}

function removeHighlight3d(pnu) {
  var ents = highlight3dEntities[pnu];
  if (ents) { try { var v = findCesiumViewer(); if (v && v.entities) { v.entities.remove(ents.poly); v.entities.remove(ents.line); } } catch(e){} delete highlight3dEntities[pnu]; }
}

function clearHighlight() {
  if (highlightLayer) highlightLayer.getSource().clear();
  selectedFeatures = {};
  Object.keys(highlight3dEntities).forEach(removeHighlight3d);
}

function pointInRing(px, py, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi)) inside = !inside;
  }
  return inside;
}
function pointInGeom(px, py, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointInRing(px, py, geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(p => pointInRing(px, py, p[0]));
  return false;
}
function geomArea(geom) {
  var ring = geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : geom.coordinates[0];
  var area = 0;
  for (var i = 0, j = ring.length-1; i < ring.length; j = i++) area += (ring[j][0]+ring[i][0]) * (ring[j][1]-ring[i][1]);
  return Math.abs(area)/2;
}

function getBuf(lon, lat) {
  var bx = 0.0003, by = 0.00025;
  try {
    if (currentMapType === "2d") {
      var res = map2d.getView().getResolution();
      bx = by = (res * 8) / 111000;
    } else {
      var z = map3d.getCurrentPosition().position.z;
      bx = 1/(111000/z*1.48*50); by = 1/(111000/z*1.85*50);
    }
  } catch(e){}
  return [Math.max(bx, 0.00008), Math.max(by, 0.00008)];
}

function processLandData(data, lon, lat) {
  var baseFeats = (data.features||[]).filter(f => f.id && f.id.toLowerCase().indexOf("lt_c_landinfobasemap") >= 0);
  if (baseFeats.length === 0) { showMsg("해당 위치에 지적 정보가 없습니다.", "err"); return; }
  var inside = baseFeats.filter(f => pointInGeom(lon, lat, f.geometry));
  var best = inside.length > 0 ? inside.reduce((a,b) => geomArea(a.geometry) <= geomArea(b.geometry) ? a : b) : null;
  if (!best) {
    var minD = Infinity;
    baseFeats.forEach(f => { var ctr = getCenter(f.geometry); var d = dist(lon, lat, ctr[0], ctr[1]); if (d < minD) { minD = d; best = f; } });
  }
  if (!best) { showMsg("필지를 찾을 수 없습니다.", "err"); return; }

  var parcelCenter = getCenter(best.geometry);
  if (currentMapType === "2d") {
    var merc = ol.proj.fromLonLat([parcelCenter[0], parcelCenter[1]]);
    var yOffset = window.innerWidth <= 768 ? (window.innerHeight * 0.55 / 2) * map2d.getView().getResolution() : 0;
    map2d.getView().animate({ center: [merc[0], merc[1] - yOffset], duration: 400 });
  } else {
    var curAlt = (map3d.getCurrentPosition() && map3d.getCurrentPosition().position.z) || 800;
    map3d.moveTo(new vw.CameraPosition(new vw.CoordZ(parcelCenter[0], parcelCenter[1], Math.max(curAlt, 400)), new vw.Direction(0, -90, 0)));
  }

  var d = Object.assign({}, best.properties);
  var uqTypes = ["lt_c_uq111","lt_c_uq112","lt_c_uq113","lt_c_uq114"];
  var uqF = null;
  for (var i = 0; i < uqTypes.length && !uqF; i++) {
    var cands = (data.features||[]).filter(f => f.id && f.id.toLowerCase().indexOf(uqTypes[i]) >= 0);
    uqF = cands.find(f => f.geometry && pointInGeom(lon, lat, f.geometry)) || (cands.length > 0 ? cands[0] : null);
  }
  d.uname = uqF ? (uqF.properties.uname || '-') : '-';
  var upCands = (data.features||[]).filter(f => f.id && f.id.toLowerCase().indexOf("lt_c_upisuq161") >= 0);
  d.dgm_nm = (upCands.find(f => f.geometry && pointInGeom(lon, lat, f.geometry)) || {}).properties?.dgm_nm || '-';
  var lpCands = (data.features||[]).filter(f => f.id && f.id.toLowerCase().indexOf("lp_pa_cbnd_bubun") >= 0);
  d.jiga = (lpCands.find(f => f.geometry && pointInGeom(lon, lat, f.geometry)) || lpCands[0] || {}).properties?.jiga || '-';

  if (collectedLandInfo.some(x => x.pnu === d.pnu)) {
    if (currentMapType === "2d") removeHighlight2d(d.pnu); else removeHighlight3d(d.pnu);
    collectedLandInfo = collectedLandInfo.filter(x => x.pnu !== d.pnu);
    removeMarker(d.pnu);
    $('.land-item[data-pnu="' + d.pnu + '"]').remove();
    $('#mobLandTbody tr[data-pnu="' + d.pnu + '"]').remove();
    $('#mobLandTbody tr').each(function(i){ $(this).find('td:first').text(i+1); });
    if ($('#mobLandTbody tr').length === 0) $('#mobLandTableWrap').removeClass('active');
    updateCnt();
    if (collectedLandInfo.length === 0) showEmptyState();
    showMsg("🔲 필지 선택이 해제되었습니다.");
  } else {
    if (currentMapType === "2d") addHighlight2d(best.geometry, d.pnu); else addHighlight3d(best.geometry, d.pnu);
    d.ecvam_gr = d.bio_gr = '-';
    addLandInfo(d);
    addMarker(lon, lat, d);
    autoOpenMobileSheet();
    showMsg("✅ 토지 정보가 추가되었습니다.", "ok");
    fetchEcvamGrade(lon, lat, res => updateEcvamGradeOnCard(d.pnu, res));
  }
}

function addLandInfo(d) {
  $(".empty-state").remove();
  collectedLandInfo.push(d);
  var addr = [d.sido_nm, d.sgg_nm, d.emd_nm, d.ri_nm, d.jibun].filter(Boolean).join(' ');
  var fmt = v => (v && v !== '-' && !isNaN(v)) ? Number(v).toLocaleString() : (v || '-');
  var safePnu = (d.pnu || '').replace(/'/g, '');
  var $item = $('<div class="land-item" data-pnu="' + d.pnu + '"></div>');
  $item.append('<div class="land-item-hd"><span title="' + addr + '">' + addr + '</span>' +
    '<button class="newwin-btn" onclick="openInNewWindow(\'' + safePnu + '\')">🔗 새창</button>' +
    '<button class="del-btn" data-pnu="' + d.pnu + '">삭제</button></div>');
  var rawArea = d.area_ || d.parea;
  var areaDisp = (rawArea && !isNaN(rawArea)) ? Math.round(Number(rawArea)).toLocaleString() : '-';
  var kv = (k, v) => '<div class="land-kv-row"><span class="land-kv-k">' + k + '</span><span class="land-kv-v">' + (v || '-') + '</span></div>';
  var $kv = $('<div class="land-kv"></div>');
  $kv.append('<div class="land-kv-sec">📐 기본정보</div>' + kv('지목', d.jimok) + kv('면적', areaDisp + ' ㎡') + kv('공시지가', fmt(d.jiga) !== '-' ? fmt(d.jiga) + ' 원/㎡' : '-') +
    '<div class="land-kv-sec">🏗 용도계획</div>' + kv('용도지역', d.uname) + kv('지구단위계획', d.dgm_nm) +
    '<div class="land-kv-sec">🌿 환경성평가</div>' +
    '<div class="land-kv-row"><span class="land-kv-k">국토환경성평가</span><span class="land-kv-v ecvam-val-ecvam">' + ecvamGrBadge(d.ecvam_gr) + '</span></div>' +
    '<div class="land-kv-row"><span class="land-kv-k">생태자연도</span><span class="land-kv-v ecvam-val-bio">' + ecvamGrBadge(d.bio_gr) + '</span></div>');
  $item.append($kv);
  $("#landList").append($item);
  var $tr = $('<tr data-pnu="' + d.pnu + '"></tr>');
  $tr.html('<td>' + collectedLandInfo.length + '</td><td style="text-align:left;padding-left:8px">' + [d.emd_nm, d.ri_nm, d.jibun].filter(Boolean).join(' ') + '</td>' +
    '<td>' + (d.jimok || '-') + '</td><td>' + areaDisp + '</td><td>' + (d.uname || '-') + '</td><td>' + (d.dgm_nm || '-') + '</td>' +
    '<td><button class="mob-del-btn" data-pnu="' + d.pnu + '">삭</button></td>');
  $('#mobLandTbody').append($tr);
  $('#mobLandTableWrap').addClass('active');
  updateCnt();
}

function autoOpenMobileSheet() { if (window.innerWidth <= 768) { $("#sidePanel").removeClass("sheet-collapsed"); $("#sheetPullToggle").text("▼"); } }
function updateSheetLabel() {
  var cnt = collectedLandInfo.length;
  if (cnt === 0) $("#sheetPullLabel").text("토지정보를 클릭하여 조회하세요");
  else {
    var total = collectedLandInfo.reduce((sum, d) => sum + (parseFloat(d.area_ || d.parea) || 0), 0);
    $("#sheetPullLabel").text(cnt + "필지 · " + Math.round(total).toLocaleString() + "㎡");
  }
}

function addMarker(lon, lat, d) {
  var addr = [d.emd_nm, d.jibun].filter(Boolean).join(' ');
  var mk = markerLayer.addMarker({ x: lon, y: lat, epsg: 'EPSG:4326', title: addr, contents: '지목: ' + (d.jimok||'-') + '<br>용도지역: ' + (d.uname||'-') + '<br>면적: ' + (Math.round(Number(d.area_||d.parea)).toLocaleString()||'-') + '㎡', iconUrl: 'https://map.vworld.kr/images/ol3/marker_red.png', text: { offsetX: 0.5, offsetY: -10, font: '12px Malgun Gothic,sans-serif', fill: { color: '#1a3a7a' }, stroke: { color: '#fff', width: 2 }, text: addr }, attr: { id: 'mk_' + d.pnu } });
  markers.push({ pnu: d.pnu, marker: mk });
}

function removeMarker(pnu) { var m = markers.find(x => x.pnu === pnu); if (m) { try{ markerLayer.removeMarker(m.marker); }catch(e){} markers = markers.filter(x => x.pnu !== pnu); } }

$(document).on('click', '.del-btn, .mob-del-btn', function() {
  var pnu = $(this).data('pnu');
  if (currentMapType === "2d") removeHighlight2d(pnu); else removeHighlight3d(pnu);
  collectedLandInfo = collectedLandInfo.filter(x => x.pnu !== pnu);
  removeMarker(pnu);
  $('.land-item[data-pnu="' + pnu + '"]').remove();
  $('#mobLandTbody tr[data-pnu="' + pnu + '"]').remove();
  $('#mobLandTbody tr').each(function(i){ $(this).find('td:first').text(i + 1); });
  if ($('#mobLandTbody tr').length === 0) $('#mobLandTableWrap').removeClass('active');
  updateCnt();
  if (collectedLandInfo.length === 0) showEmptyState();
  showMsg("선택한 토지 정보를 삭제했습니다.");
});

function showEmptyState() { if (!$('#landList .empty-state').length) $('#landList').append('<div class="empty-state"><div class="ico">📍</div><p>지도에서 토지를 클릭하면<br>상세 정보가 표시됩니다</p></div>'); }

function updateCnt() {
  var cnt = collectedLandInfo.length;
  $("#landCnt").text("총 " + cnt + "건");
  var total = collectedLandInfo.reduce((sum, d) => sum + (parseFloat(d.area_ || d.parea) || 0), 0);
  if (cnt > 0) {
    $("#areaCnt").text(cnt);
    $("#areaSumVal").text(total.toLocaleString('ko-KR', { maximumFractionDigits:1 }) + ' ㎡  ≈  ' + (total * 0.3025).toLocaleString('ko-KR', { maximumFractionDigits:1 }) + ' 평');
    $("#areaSumBar").show();
  } else $("#areaSumBar").hide();
  updateSheetLabel();
}

function closeAddrResults() { $('#addrResults').remove(); }
function selectAddrResult(lon, lat, label) { closeAddrResults(); $("#addrInput").val(label); moveTo(lon, lat); showMsg("📍 '" + label + "' 위치로 이동 중...", "ok"); if (isLandParcelActive) setTimeout(() => fetchLandInfo(lon, lat), 400); }
function doSearch(q, cat, cb) {
  $.ajax({
    type: "get", url: "https://api.vworld.kr/req/search",
    data: { service: "search", version: "2.0", request: "search", key: apiKey, format: "json", size: 8, page: 1, query: q, type: "address", category: cat, crs: "EPSG:4326" },
    dataType: "jsonp", success: function(data) {
      var items = (data.response.status === "OK") ? (data.response.result.items || []) : [];
      if (items.length > 0) {
        if (items.length === 1) selectAddrResult(parseFloat(items[0].point.x), parseFloat(items[0].point.y), items[0].title || items[0].address || q);
        else showAddrResults(items);
        if (cb) cb(true);
      } else { if (cb) cb(false); else if (cat === "parcel") showMsg("주소를 찾을 수 없습니다: " + q, "err"); }
    }, error: function() { if (cb) cb(false); else showMsg("주소 검색 오류가 발생했습니다.", "err"); }
  });
}

function showAddrResults(items) {
  closeAddrResults();
  var $drop = $('<div id="addrResults" class="addr-results"></div>');
  items.forEach(item => {
    var pt = item.point; if (!pt) return;
    var lon = parseFloat(pt.x), lat = parseFloat(pt.y);
    var label = item.title || item.address || item.name || '';
    var $r = $('<div class="addr-result-item"><span class="addr-result-name">' + label + '</span></div>');
    $r.on('click', () => selectAddrResult(lon, lat, label));
    $drop.append($r);
  });
  $('.search-row').append($drop);
  setTimeout(() => $(document).one('click.addrClose', e => { if (!$(e.target).closest('#addrResults, #addrInput').length) closeAddrResults(); }), 100);
}

function moveTo(lon, lat) {
  if (currentMapType === "2d") { map2d.getView().setCenter(ol.proj.fromLonLat([lon, lat])); map2d.getView().setZoom(19); }
  else map3d.moveTo(new vw.CameraPosition(new vw.CoordZ(lon, lat, 800), new vw.Direction(0, -90, 0)));
}

function setupEvents() {
  $("#addrInput").on('keydown', e => { if (e.key === 'Enter') window.searchAddress(); if (e.key === 'Escape') closeAddrResults(); });
  $(document).on('click', '#ol3map, #vmap', () => closeAddrResults());
}

function showMsg(msg, type) {
  var $b = $("#statusBar"); $b.removeClass("ok err").addClass(type||'').text(msg).show();
  clearTimeout($b.data('tid')); $b.data('tid', setTimeout(() => $b.fadeOut(), 4000));
}

function dist(l1,t1,l2,t2) {
  var R=6371000, f1=t1*Math.PI/180, f2=t2*Math.PI/180, df=(t2-t1)*Math.PI/180, dl=(l2-l1)*Math.PI/180;
  var a=Math.sin(df/2)*Math.sin(df/2)+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)*Math.sin(dl/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function getCenter(geom) {
  try {
    var c = geom.type==='MultiPolygon' ? geom.coordinates[0][0] : geom.coordinates[0];
    var sx=0, sy=0; c.forEach(p => { sx+=p[0]; sy+=p[1]; });
    return [sx/c.length, sy/c.length];
  } catch(e){ return [0,0]; }
}

function debounce(fn, wait) { var t; return function() { var a=arguments, ctx=this; clearTimeout(t); t = setTimeout(() => fn.apply(ctx,a), wait); }; }
