/**
 * 旅行地图业务逻辑
 */

// 1. 初始化地图
var map = L.map('map', {
    zoomControl: false 
}).setView([35, 105], 4); 

// 手动添加缩放控件到左下角
L.control.zoom({
    position: 'bottomleft'
}).addTo(map);

let visitedPlaces = JSON.parse(localStorage.getItem('myVisitedPlaces')) || [];
let interestedPlaces = JSON.parse(localStorage.getItem('myInterestedPlaces')) || [];
let allLandmarks = []; 
let markerLayer = L.layerGroup().addTo(map);
let geojsonLayers = [];
let placeLayerMapping = {}; 

// 2. 辅助函数
function getCnName(enName) {
    return (typeof countryNameMap !== 'undefined' && countryNameMap[enName]) || enName;
}

function updateCounts() {
    document.getElementById('visited-count').innerText = visitedPlaces.length;
    document.getElementById('interested-count').innerText = interestedPlaces.length;
}

function getPolygonStyle(placeId) {
    const isVisited = visitedPlaces.includes(placeId);
    const isInterested = interestedPlaces.includes(placeId);
    let color = '#B3E5FC';
    if (isVisited) color = '#0288D1';
    else if (isInterested) color = '#FFCC80';

    return { 
        fillColor: color, weight: 1, opacity: 1, color: '#ffffff', 
        fillOpacity: (isVisited || isInterested) ? 0.9 : 0.6 
    };
}

// 3. 地图层级初始化
function setupMapLayers() {
    const worldUrl = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
    const chinaUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
    const datalist = document.getElementById('places-list');

    Promise.all([fetch(worldUrl).then(r => r.json()), fetch(chinaUrl).then(r => r.json())])
    .then(([worldData, chinaData]) => {
        worldData.features = worldData.features.filter(f => f.properties.name !== 'China');
        
        const onEachFeature = (feature, layer) => {
            const placeId = feature.properties.name; 
            const displayName = getCnName(placeId); 
            
            placeLayerMapping[displayName] = layer;

            const option = document.createElement('option');
            option.value = displayName;
            datalist.appendChild(option);
            
            layer.bindTooltip(displayName, {sticky: true, direction: 'auto'});
            
            layer.on('click', function(e) {
                const isVis = visitedPlaces.includes(placeId);
                const isInt = interestedPlaces.includes(placeId);
                const popupHtml = `
                    <div class="action-popup">
                        <div class="action-title">${displayName}</div>
                        <button class="action-btn btn-visited ${isVis ? 'active' : ''}" onclick="toggleState('${placeId}', 'visited')">
                            ${isVis ? '✅ 已去过' : '📍 标记为去过'}
                        </button>
                        <button class="action-btn btn-interested ${isInt ? 'active' : ''}" onclick="toggleState('${placeId}', 'interested')">
                            ${isInt ? '❤️ 已种草' : '⭐ 感兴趣'}
                        </button>
                    </div>
                `;
                const popupCenter = e.latlng || layer.getBounds().getCenter();
                L.popup().setLatLng(popupCenter).setContent(popupHtml).openOn(map);
            });
        };

        const worldLayer = L.geoJSON(worldData, { style: f => getPolygonStyle(f.properties.name), onEachFeature: onEachFeature }).addTo(map);
        geojsonLayers.push(worldLayer);

        const chinaLayer = L.geoJSON(chinaData, { style: f => getPolygonStyle(f.properties.name), onEachFeature: onEachFeature }).addTo(map);
        geojsonLayers.push(chinaLayer);
    });
}

// 4. 搜索与状态切换
window.searchPlace = function() {
    const inputVal = document.getElementById('search-input').value.trim();
    if (!inputVal) return;
    const targetLayer = placeLayerMapping[inputVal];
    if (targetLayer) {
        map.flyToBounds(targetLayer.getBounds(), { padding: [20, 20], maxZoom: 5, duration: 1.5 });
        setTimeout(() => { targetLayer.fire('click'); }, 1200);
    } else {
        alert("未找到该地点，请检查输入是否准确。");
    }
};

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') window.searchPlace();
});

window.toggleState = function(placeId, type) {
    let targetArray = type === 'visited' ? visitedPlaces : interestedPlaces;
    let otherArray = type === 'visited' ? interestedPlaces : visitedPlaces;
    
    const index = targetArray.indexOf(placeId);
    if (index > -1) { targetArray.splice(index, 1); } 
    else {
        targetArray.push(placeId); 
        const otherIndex = otherArray.indexOf(placeId);
        if (otherIndex > -1) otherArray.splice(otherIndex, 1);
    }

    localStorage.setItem('myVisitedPlaces', JSON.stringify(visitedPlaces));
    localStorage.setItem('myInterestedPlaces', JSON.stringify(interestedPlaces));
    updateCounts();
    
    geojsonLayers.forEach(layer => { layer.eachLayer(l => l.setStyle(getPolygonStyle(l.feature.properties.name))); });
    renderMarkers();
    map.closePopup();
};

// 5. 地标 Marker 渲染
const categoryIcons = { 'mountain': '⛰️', 'nature': '🌲', 'building': '🏛️', 'default': '📍' };
Papa.parse("../data/landmarks.csv", {
    download: true, header: true, skipEmptyLines: true,
    complete: function(results) {
        allLandmarks = results.data;
        renderMarkers(); 
    }
});

function renderMarkers() {
    markerLayer.clearLayers(); 
    const isChinaInterested = interestedPlaces.some(place => /省|市|自治区|特别行政区/.test(place));

    allLandmarks.forEach(row => {
        const shouldShow = interestedPlaces.includes(row.country_en) || (row.country_en === 'China' && isChinaInterested);
        if (shouldShow) {
            const icon = categoryIcons[row.type] || categoryIcons['default'];
            const customIcon = L.divIcon({ className: 'emoji-icon-container', html: `<div>${icon}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
            const marker = L.marker([parseFloat(row.lat), parseFloat(row.lng)], {icon: customIcon});
            marker.bindPopup(`
                <div style="min-width:200px;">
                    <h4 style="margin:0 0 5px 0; color:#d35400;">🏆 ${row.name}</h4>
                    <p style="font-size:0.9em; margin:0 0 8px 0;">${row.desc}</p>
                    <a href="${row.link}" target="_blank">官网详情 ↗</a>
                </div>
            `);
            markerLayer.addLayer(marker);
        }
    });
}

// 执行初始化
updateCounts();
setupMapLayers();