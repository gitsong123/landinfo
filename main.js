/* ===================================================
   전역 변수 및 상태
=================================================== */
var apiKey = "A12CEDAE-86F1-3453-BC92-3FD98BE14103";
var ecvamApiKey = "MUTW-PGHX-76CT-ENMD";
var ECVAM_WMS = "https://ecvam.neins.go.kr/apicall.do";
var map2d, map3d, markerLayer;
var currentMapType = "2d";
var isLandParcelActive = false;
var landLayer2d = null, landLayer3d = null;
var map3dClickAdded = false;
var collectedLandInfo = [];
var markers = [];
var themeLayers = {};
var ecvamThemeLayers = {};
var cache = {};
var highlightLayer = null;
var selectedFeatures = {};

/* 주제도 데이터 정의 */
var themeData = [
  { name:"연속지적도",        layer:"LP_PA_CBND_BUBUN",    lf:"jibun" },
  { name:"도시지역(용도지역)", layer:"LT_C_UQ111",          lf:"uname" },
  { name:"지구단위계획구역",   layer:"LT_C_UPISUQ161",      lf:"dgm_nm" }
];

/* ===================================================
   초기화 실행
=================================================== */
$(document).ready(function() {
  function tryInit() {
    if (typeof vw !== 'undefined' && typeof ol !== 'undefined') {
      init2dMap();
      init3dMap();
      setupEvents();
      initThemeList();
      
      // 지적도 자동 활성화 및 가시성 확보
      $("#landChk").prop("checked", true);
      window.toggleLandParcel(true);
    } else {
      setTimeout(tryInit, 300);
    }
  }
  tryInit();

  $(window).on('resize', function(){
    if (currentMapType === "2d" && map2d) map2d.updateSize();
  });
});

/* ===================================================
   지도 초기화 함수 (줌 18 고정)
=================================================== */
function init2dMap() {
  map2d = new vw.ol3.Map("ol3map", {
    basemapType: vw.ol3.BasemapType.GRAPHIC,
    controlDensity: vw.ol3.DensityType.EMPTY,
    interactionDensity: vw.ol3.DensityType.BASIC,
    controlsAutoArrange: true
  });
  // 지적도가 보이는 스케일(18)로 시작
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
   전역 스코프 등록 (HTML 인라인 호출용)
=================================================== */
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

window.toggleLandParcel = function(enable) {
  if (currentMapType === "3d") {
    if (enable && !isLandParcelActive) {
      var wmsSource = new vw.source.TileWMS();
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
  var q = $("#addrInput").val().trim();
  if (!q) return;
  $.ajax({
    type: "get", url: "https://api.vworld.kr/req/search",
    data: { service:"search", version:"2.0", request:"search", key:apiKey, query:q, type:"address", category:"road", crs:"EPSG:4326", format:"json" },
    dataType: "jsonp",
    success: function(data) {
      if (data.response.status === "OK" && data.response.result.items.length > 0) {
        var pt = data.response.result.items[0].point;
        moveTo(parseFloat(pt.x), parseFloat(pt.y));
        if (isLandParcelActive) setTimeout(function(){ fetchLandInfo(parseFloat(pt.x), parseFloat(pt.y)); }, 500);
      } else { showMsg("주소를 찾을 수 없습니다.", "err"); }
    }
  });
};

/* ===================================================
   클릭 처리 로직 (PIP 포함)
=================================================== */
function handleMap2dClick(evt) {
  if (!isLandParcelActive) return;
  var lonLat = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');
  fetchLandInfo(lonLat[0], lonLat[1]);
}

function handleMap3dClick(wp, ep, carto) {
  if (carto && isLandParcelActive) fetchLandInfo(carto.longitudeDD, carto.latitudeDD);
}

function fetchLandInfo(lon, lat) {
  showMsg("🔍 토지 정보 조회 중...");
  var buf = 0.00015;
  var bbox = (lon-buf)+","+(lat-buf)+","+(lon+buf)+","+(lat+buf);
  
  $.ajax({
    type: "get",
    url: "https://api.vworld.kr/req/wfs",
    data: {
      key: apiKey, SERVICE: "WFS", version: "1.1.0", request: "GetFeature",
      TYPENAME: "lt_c_landinfobasemap,lt_c_uq111,lt_c_upisuq161",
      OUTPUT: "text/javascript", SRSNAME: "EPSG:4326", BBOX: bbox
    },
    dataType: "jsonp",
    jsonpCallback: "parseResponse",
    success: function(data) {
      if (data && data.totalFeatures > 0) {
        processLandData(data, lon, lat);
      } else {
        showMsg("정보가 없습니다.", "err");
      }
    }
  });
}

function processLandData(data, lon, lat) {
  var feats = data.features.filter(function(f){ return f.id.includes("lt_c_landinfobasemap"); });
  if (feats.length === 0) return;

  var best = feats[0];
  var d = best.properties;

  if (collectedLandInfo.some(function(x){ return x.pnu === d.pnu; })) {
    showMsg("이미 추가된 필지입니다."); return;
  }

  // 하이라이트 (2D)
  if (currentMapType === "2d" && best.geometry) {
    var coords = best.geometry.type === 'MultiPolygon' ? best.geometry.coordinates[0][0] : best.geometry.coordinates[0];
    var poly = new ol.geom.Polygon([coords.map(function(c){ return ol.proj.fromLonLat(c); })]);
    var f = new ol.Feature({ geometry: poly });
    highlightLayer.getSource().addFeature(f);
    selectedFeatures[d.pnu] = f;
  }

  addLandInfo(d);
  showMsg("✅ 추가되었습니다.", "ok");
  moveTo(lon, lat, true);
}

function addLandInfo(d) {
  collectedLandInfo.push(d);
  var $tr = $('<tr data-pnu="'+d.pnu+'"><td>'+collectedLandInfo.length+'</td><td>'+d.emd_nm+' '+d.jibun+'</td><td>'+d.jimok+'</td><td>'+Math.round(d.parea || 0)+'</td><td>'+(d.uname||'-')+'</td><td><button class="mob-del-btn" onclick="window.removeLand(\''+d.pnu+'\')">삭</button></td></tr>');
  $('#mobLandTbody').append($tr);
  $('#mobLandTableWrap').addClass('active');
  updateUI();
}

window.removeLand = function(pnu) {
  if (selectedFeatures[pnu]) highlightLayer.getSource().removeFeature(selectedFeatures[pnu]);
  collectedLandInfo = collectedLandInfo.filter(function(x){ return x.pnu !== pnu; });
  $('tr[data-pnu="'+pnu+'"]').remove();
  updateUI();
};

function updateUI() {
  $("#landCnt").text("총 " + collectedLandInfo.length + "건");
  var total = collectedLandInfo.reduce(function(s, x){ return s + (parseFloat(x.parea) || 0); }, 0);
  $("#areaSumVal").text(Math.round(total).toLocaleString() + " ㎡");
  if (collectedLandInfo.length > 0) {
    $("#areaSumBar").show();
    $("#sheetPullLabel").text(collectedLandInfo.length + "필지 · " + Math.round(total).toLocaleString() + "㎡");
  } else {
    $("#areaSumBar").hide();
    $("#sheetPullLabel").text("토지정보를 클릭하여 조회하세요");
  }
}

/* ===================================================
   유틸리티
=================================================== */
function moveTo(lon, lat, offset) {
  var center = ol.proj.fromLonLat([lon, lat]);
  if (offset && window.innerWidth <= 768) {
    var res = map2d.getView().getResolution();
    center = [center[0], center[1] - (window.innerHeight * 0.2 * res)];
  }
  if (currentMapType === "2d") map2d.getView().animate({ center: center, zoom: 18, duration: 400 });
}

function showMsg(msg, type) {
  $("#statusBar").removeClass("ok err").addClass(type||'').text(msg).show().fadeOut(3000);
}

function debounce(fn, wait) {
  var t; return function() { clearTimeout(t); var ctx=this, args=arguments; t=setTimeout(function(){ fn.apply(ctx,args); }, wait); };
}

/* 나머지 윈도우 바인딩 */
window.toggleThemePanel = function() { $("#themeList").slideToggle(); };
window.toggleEcvamPanel = function() { $("#ecvamThemeList").slideToggle(); };
window.toggleMobileSheet = function() { $("#sidePanel").toggleClass("sheet-collapsed"); };
window.clearLandInfo = function() { if(confirm("초기화하시겠습니까?")) location.reload(); };
window.exportToCSV = function() { alert("내보내기 기능 준비 중"); };
function initThemeList() {}
