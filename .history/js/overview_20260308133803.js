/**
 * 宏观地图逻辑控制 - 连续色阶 + 字段汉化版
 */

const map = L.map('map', { zoomControl: false, minZoom: 2 }).setView([30, 10], 2);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

let macroData = {}, geojsonLayers = [], allFeatures = [];
let currentIndicator = 'gdp_per_capita';

// 1. 字段名汉化映射
const fieldLabelMap = {
    "place_id": "地区 ID",
    "gdp_total": "GDP 总额 (十亿$)",
    "gdp_per_capita": "人均 GDP ($)",
    "gdp_growth": "经济增长率 (%)",
    "pop_density": "人口密度 (人/km²)",
    "hdi": "人类发展指数 (HDI)",
    "median_age": "年龄中位数",
    "internet_user": "互联网普及率 (%)",
    "gini": "基尼系数",
    "forest_area": "森林覆盖率 (%)",
    "co2_per_capita": "人均碳排放",
    "avg_temp": "平均气温 (℃)"
};

// 2. 指标视觉配置
const indicatorThemes = {
    // 经济类 (绿色/蓝色系)
    gdp_per_capita: { h: 140, desc: "反映国民富裕程度。颜色越深，人均收入越高。" },
    gdp_total: { h: 210, desc: "反映国家经济总量。颜色越深，体量越大。" },
    gdp_growth: { h: 30, desc: "反映经济活力。越橙红代表增长越快。" },
    gini: { h: 0, desc: "反映收入分配公平性。颜色越深代表贫富差距越大。" },

    // 社会类 (紫色/黄色系)
    hdi: { h: 280, desc: "综合衡量健康、教育和生活水平。紫色越深代表发展水平越高。" },
    pop_density: { h: 340, desc: "反映人口聚集度。深红色代表极其拥挤。" },
    median_age: { h: 200, desc: "反映人口老龄化程度。颜色越深代表平均年龄越高。" },
    internet_user: { h: 180, desc: "反映数字化程度。颜色越深代表互联网普及率越高。" },

    // 环境类 (深绿/深棕系)
    forest_area: { h: 120, desc: "反映生态保护情况。颜色越深代表森林覆盖率越高。" },
    co2_per_capita: { h: 10, desc: "反映人均碳排放。颜色越深代表排放量越高。" },
    avg_temp: { h: 15, desc: "反映地区气候特征。颜色越深代表气温越高。" }
};

// 工具：获取国家中文名
function getCnName(enName) { 
    return (typeof countryNameMap !== 'undefined' && countryNameMap[enName]) || enName; 
}

// 核心：计算连续色阶
function getDataRange(indicator) {
    const values = Object.values(macroData).map(d => parseFloat(d[indicator])).filter(v => !isNaN(v));
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

// 更新视图
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

// 交互函数
function toggleInfo() { document.getElementById('info-card').classList.toggle('collapsed'); }
function closeDetail() { document.getElementById('detail-card').style.display = 'none'; }

function showDetail(enName) {
    const data = macroData[enName];
    document.getElementById('detail-title').innerText = getCnName(enName);
    
    let html = "";
    if (data) {
        html = Object.entries(data).map(([key, value]) => {
            // 跳过一些不显示的字段或进行汉化
            if(key === "name_en") return ""; // 举例：隐藏某些字段
            const label = fieldLabelMap[key] || key;
            return `<div class="data-row"><span>${label}</span><b>${value || '-'}</b></div>`;
        }).join('');
    } else {
        html = '<div style="padding:20px; color:#999;">暂无该地区详细数据</div>';
    }
    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('detail-card').style.display = 'block';
}

// 搜索逻辑
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

// 数据加载逻辑
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