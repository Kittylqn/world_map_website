const map = L.map('map', { zoomControl: false, minZoom: 2 }).setView([30, 10], 2);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

let macroData = {}, geojsonLayers = [], allFeatures = [];
let currentIndicator = 'gdp_per_capita';

const indicatorThemes = {
    gdp_per_capita: { h: 140, desc: "反映国民富裕程度。颜色越深，人均收入越高。" },
    gdp_total: { h: 210, desc: "反映国家经济总量。颜色越深，规模越大。" },
    gdp_growth: { h: 30, desc: "反映经济活力。越橙红代表增长越快。" },
    pop_density: { h: 0, desc: "反映人口聚集度。深红色代表极其拥挤。" },
    hdi: { h: 280, desc: "综合衡量社会发展水平。紫色越深，发展水平越高。" }
};

function getDataRange(indicator) {
    const values = Object.values(macroData)
        .map(d => parseFloat(d[indicator]))
        .filter(v => !isNaN(v));
    if (values.length === 0) return { min: 0, max: 100, avg: 0 };
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    };
}

function getContinuousColor(val, range, hue) {
    if (val === null || val === undefined || isNaN(val)) return '#f0f0f0';
    let pct = (val - range.min) / (range.max - range.min);
    pct = Math.max(0, Math.min(1, pct)); 
    const l = 90 - (pct * 70); 
    return `hsl(${hue}, 70%, ${l}%)`;
}

function updateView() {
    currentIndicator = document.getElementById('indicator-select').value;
    const range = getDataRange(currentIndicator);
    const theme = indicatorThemes[currentIndicator];

    geojsonLayers.forEach(layer => {
        layer.setStyle(f => {
            const val = macroData[f.properties.name]?.[currentIndicator];
            return {
                fillColor: getContinuousColor(parseFloat(val), range, theme.h),
                weight: 1, color: 'white', fillOpacity: 0.8
            };
        });
    });

    document.getElementById('scale-bar').style.background = 
        `linear-gradient(to right, hsl(${theme.h}, 70%, 90%), hsl(${theme.h}, 70%, 20%))`;
    document.getElementById('label-min').innerText = range.min;
    document.getElementById('label-avg').innerText = "~" + range.avg;
    document.getElementById('label-max').innerText = range.max;
    document.getElementById('indicator-desc').innerHTML = theme.desc;
}

function getCnName(enName) { return (typeof countryNameMap !== 'undefined' && countryNameMap[enName]) || enName; }
function toggleInfo() { document.getElementById('info-card').classList.toggle('collapsed'); }
function closeDetail() { document.getElementById('detail-card').style.display = 'none'; }

function showDetail(enName) {
    const data = macroData[enName];
    document.getElementById('detail-title').innerText = getCnName(enName);
    let html = data ? Object.entries(data).map(([k, v]) => `<div class="data-row"><span>${k}</span><b>${v}</b></div>`).join('') : "无数据";
    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('detail-card').style.display = 'block';
}

function handleSearch() {
    const q = document.getElementById('search-box').value.trim().toLowerCase();
    const resDiv = document.getElementById('search-results');
    if(!q) { resDiv.style.display='none'; return; }
    const matches = allFeatures.filter(f => getCnName(f.properties.name).toLowerCase().includes(q)).slice(0, 6);
    resDiv.innerHTML = matches.map(f => `<div class="search-item" onclick="selectCountry('${f.properties.name}')">${getCnName(f.properties.name)}</div>`).join('');
    resDiv.style.display = 'block';
}

function selectCountry(enName) {
    const layers = geojsonLayers.flatMap(l => Object.values(l._layers));
    const target = layers.find(l => l.feature && l.feature.properties.name === enName);
    if(target) { map.flyTo(target.getBounds().getCenter(), 4); showDetail(enName); document.getElementById('search-results').style.display='none'; }
}

// 注意此处的路径指向根目录下的 data 文件夹
Papa.parse("../data/macro_data.csv", {
    download: true, header: true, complete: function(results) {
        results.data.forEach(r => macroData[r.place_id] = r);
        const urls = [
            'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
            'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
        ];
        Promise.all(urls.map(u => fetch(u).then(r => r.json()))).then(([world, china]) => {
            world.features = world.features.filter(f => f.properties.name !== 'China');
            allFeatures = [...world.features, ...china.features];
            const layerCfg = {
                style: { weight: 1, color: 'white', fillOpacity: 0.8 },
                onEachFeature: (f, l) => {
                    l.on('click', (e) => { L.DomEvent.stopPropagation(e); showDetail(f.properties.name); });
                    l.on('mouseover', () => {
                        const val = macroData[f.properties.name]?.[currentIndicator] || "无";
                        l.bindTooltip(`<b>${getCnName(f.properties.name)}</b>: ${val}`, { sticky: true }).openTooltip();
                        l.setStyle({ weight: 2, color: '#333' });
                    });
                    l.on('mouseout', () => l.setStyle({ weight: 1, color: 'white' }));
                }
            };
            geojsonLayers.push(L.geoJSON(world, layerCfg).addTo(map));
            geojsonLayers.push(L.geoJSON(china, layerCfg).addTo(map));
            updateView();
        });
    }
});

map.on('click', closeDetail);